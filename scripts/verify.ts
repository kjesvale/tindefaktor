/**
 * Verifiserer analysekjeden mot ekte høydedata og kjente fjell.
 *
 * Enhetstestene dekker algoritmene hver for seg på konstruerte rutenett. Dette
 * skriptet kjører de samme modulene på ordentlige Terrarium-fliser over Jotunheimen
 * og sjekker at toppene som kommer ut faktisk er de fjellene som står der.
 *
 *     bun run scripts/verify.ts
 */

import zlib from "node:zlib";
import { buildMaxPyramid, nearestHigher } from "../src/lib/isolation";
import { findPeaks, type Dem } from "../src/lib/prominence";
import { elevationFromRgb, terrariumTileUrl } from "../src/lib/terrarium";
import { fetchPlaceNames, isPeakType, matchNames } from "../src/lib/stedsnavn";
import {
    distanceMeters,
    gridFor,
    pixelToLngLat,
    TILE_SIZE,
    tileRangeFor,
    type Bounds,
} from "../src/lib/tiles";

/** Minimal PNG-dekoder. Node har ingen innebygd, og vi trenger bare Terrarium-varianten. */
const decodePng = (buffer: Buffer) => {
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    const chunks: Buffer[] = [];

    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("ascii", offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            colorType = data[9]!;
        }
        if (type === "IDAT") chunks.push(data);
        if (type === "IEND") break;
        offset += 12 + length;
    }

    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]!;
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    const stride = width * channels;
    const pixels = Buffer.alloc(width * height * channels);

    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)]!;
        const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? pixels[y * stride + i - channels]! : 0;
            const b = y > 0 ? pixels[(y - 1) * stride + i]! : 0;
            const c = i >= channels && y > 0 ? pixels[(y - 1) * stride + i - channels]! : 0;
            let value = line[i]!;
            if (filter === 1) value += a;
            else if (filter === 2) value += b;
            else if (filter === 3) value += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            pixels[y * stride + i] = value & 0xff;
        }
    }
    return { width, height, channels, pixels };
};

const bounds: Bounds = { south: 61.44, west: 7.9, north: 61.78, east: 8.72 };
const zoom = 12;

const range = tileRangeFor(bounds, zoom);
const grid = gridFor(range);
const values = new Float32Array(grid.width * grid.height);

const queue: { x: number; y: number }[] = [];
for (let y = range.minY; y <= range.maxY; y++) {
    for (let x = range.minX; x <= range.maxX; x++) queue.push({ x, y });
}

console.log(`Laster ${queue.length} høydefliser (zoom ${zoom})…`);
const downloadStart = performance.now();
await Promise.all(
    Array.from({ length: 12 }, async () => {
        for (;;) {
            const tile = queue.pop();
            if (!tile) return;
            const response = await fetch(terrariumTileUrl(zoom, tile.x, tile.y));
            const image = decodePng(Buffer.from(await response.arrayBuffer()));
            const originX = (tile.x - range.minX) * TILE_SIZE;
            const originY = (tile.y - range.minY) * TILE_SIZE;
            for (let y = 0; y < TILE_SIZE; y++) {
                for (let x = 0; x < TILE_SIZE; x++) {
                    const source = (y * TILE_SIZE + x) * image.channels;
                    values[(originY + y) * grid.width + originX + x] = elevationFromRgb(
                        image.pixels[source]!,
                        image.pixels[source + 1]!,
                        image.pixels[source + 2]!,
                    );
                }
            }
        }
    }),
);
const downloadMs = performance.now() - downloadStart;

const dem: Dem = { values, width: grid.width, height: grid.height };
console.log(
    `  ${grid.width}×${grid.height} = ${(values.length / 1e6).toFixed(1)} Mpx på ${(downloadMs / 1000).toFixed(1)} s\n`,
);

const analysisStart = performance.now();
const peaks = findPeaks(dem, 100);
const pyramid = buildMaxPyramid(dem);
const analysisMs = performance.now() - analysisStart;

const positioned = peaks
    .map(peak => {
        const [lon, lat] = pixelToLngLat(grid, peak.index);
        const higher = nearestHigher(pyramid, dem, peak.index);
        let isolation = -1;
        if (higher >= 0) {
            const [higherLon, higherLat] = pixelToLngLat(grid, higher);
            isolation = distanceMeters(lon, lat, higherLon, higherLat);
        }
        return { ...peak, lon, lat, isolation };
    })
    .sort((a, b) => b.prominence - a.prominence);

console.log(
    `Analyse: ${positioned.length} topper med primærfaktor ≥ 100 m på ${Math.round(analysisMs)} ms\n`,
);

console.log("Henter stedsnavn fra Kartverket…");
const places = await fetchPlaceNames(bounds);
const names = matchNames(
    positioned,
    places.filter(place => isPeakType(place.type)),
    400,
);
console.log(`  ${places.length} navn hentet\n`);

/**
 * Offisielle høyder. Terrarium bygger på SRTM, som har en oppgitt vertikal nøyaktighet
 * rundt 16 m, og datasettet ligger konsekvent litt under fasit i bratt terreng. Vi
 * krever derfor bare at høyden er innenfor 25 m og aldri over — en topp som måles
 * høyere enn fasit ville tydet på en feil i dekodingen.
 */
const known: Record<string, { elevation: number; tolerance?: number }> = {
    Galdhøpiggen: { elevation: 2469 },
    Glittertinden: { elevation: 2465 },
    Surtningssue: { elevation: 2368 },
    Besshøe: { elevation: 2258 },
    // Store Skagastølstind er en smal granittspir. Et rutenett på 18 m midler over
    // hele toppartiet, så avviket her måler oppløsningen, ikke en feil i analysen.
    Storen: { elevation: 2405, tolerance: 40 },
};

console.log("De 15 mest prominente toppene:\n");
console.log("     navn                      høyde   primærfaktor   isolasjon   sadel");
for (const [index, peak] of positioned.slice(0, 15).entries()) {
    const name = names[index] ?? "(uten navn)";
    const saddle = peak.saddleIndex >= 0 ? `${Math.round(peak.saddleElevation)} m` : "—";
    const isolation = peak.isolation < 0 ? "ukjent" : `${(peak.isolation / 1000).toFixed(1)} km`;
    const flag = peak.bounded ? "" : "  ~";
    console.log(
        `  ${String(index + 1).padStart(2)}. ${name.padEnd(24)} ${String(Math.round(peak.elevation)).padStart(5)} m` +
            `   ${String(Math.round(peak.prominence)).padStart(7)} m   ${isolation.padStart(9)}   ${saddle.padStart(7)}${flag}`,
    );
}

console.log("\nKontroll mot kjente fjell:\n");
let failures = 0;
for (const [name, { elevation: truth, tolerance = 25 }] of Object.entries(known)) {
    const index = names.findIndex(candidate => candidate === name);
    if (index < 0) {
        console.log(`  ✗ ${name}: ble ikke funnet blant toppene`);
        failures++;
        continue;
    }

    const peak = positioned[index]!;
    const error = truth - peak.elevation;
    // Registerets eget punkt er fasit for posisjonen.
    const place = places.find(candidate => candidate.name === name)!;
    const offset = distanceMeters(peak.lon, peak.lat, place.lon, place.lat);

    const ok = error >= -2 && error <= tolerance && offset < 250;
    if (!ok) failures++;
    console.log(
        `  ${ok ? "✓" : "✗"} ${name.padEnd(16)} ${Math.round(peak.elevation)} m ` +
            `(fasit ${truth} m, ${error.toFixed(1)} m under) · ${Math.round(offset)} m fra registerets punkt`,
    );
}

const nonMaxima = positioned.filter(peak => {
    const x = peak.index % dem.width;
    const offsets = [
        -1,
        1,
        -dem.width,
        dem.width,
        -dem.width - 1,
        -dem.width + 1,
        dem.width - 1,
        dem.width + 1,
    ];
    return offsets.some(offset => {
        const neighbour = peak.index + offset;
        if (neighbour < 0 || neighbour >= values.length) return false;
        if (Math.abs((neighbour % dem.width) - x) > 1) return false;
        return values[neighbour]! > values[peak.index]!;
    });
});
console.log(
    `\n  ${nonMaxima.length === 0 ? "✓" : "✗"} alle topper er strengt lokale maksima (${nonMaxima.length} avvik)`,
);
if (nonMaxima.length > 0) failures++;

const badIsolation = positioned.filter(
    peak => peak.prominence > 300 && peak.isolation >= 0 && peak.isolation < 100,
);
console.log(
    `  ${badIsolation.length === 0 ? "✓" : "✗"} ingen prominent topp med urimelig lav isolasjon (${badIsolation.length} avvik)`,
);
if (badIsolation.length > 0) failures++;

// Sadelen må ligge lavere enn toppen, ellers er primærfaktoren meningsløs.
const badSaddles = positioned.filter(
    peak => peak.saddleIndex >= 0 && peak.saddleElevation >= peak.elevation,
);
console.log(
    `  ${badSaddles.length === 0 ? "✓" : "✗"} alle sadler ligger under sin topp (${badSaddles.length} avvik)`,
);
if (badSaddles.length > 0) failures++;

const named = names.filter(Boolean).length;
console.log(
    `\n  ${named} av ${positioned.length} topper fikk navn (${Math.round((named / positioned.length) * 100)} %)`,
);

console.log(failures === 0 ? "\nAlt stemmer.\n" : `\n${failures} kontroller feilet.\n`);
process.exit(failures === 0 ? 0 : 1);
