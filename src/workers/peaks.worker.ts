/**
 * Analyse-workeren: laster ned høydefliser for utsnittet, finner toppene og måler
 * isolasjonen deres. Alt tungt arbeid ligger her, slik at kartet holder seg flytende
 * mens analysen pågår.
 */

import { buildMaxPyramid, nearestHigher } from "../lib/isolation";
import type { FoundPeak, FromWorker, SearchRequest, SearchStage, ToWorker } from "../lib/messages";
import { findPeaks, type Dem } from "../lib/prominence";
import { decodeTile, terrariumTileUrl, writeTileIntoGrid } from "../lib/terrarium";
import {
    containsLngLat,
    distanceMeters,
    gridFor,
    metersPerPixel,
    pickDemZoom,
    pixelToLngLat,
    TILE_SIZE,
    tileRangeFor,
} from "../lib/tiles";

/** Antall samtidige nedlastinger. Høyere gir lite ekstra mot AWS sin flistjener. */
const CONCURRENCY = 12;

/** Fremdrift meldes på klokke, ikke per flis, slik at meldingskøen ikke drukner. */
const PROGRESS_INTERVAL_MS = 100;

// tsconfig bruker DOM-lib fordi resten av koden trenger den, så `self` er typet som
// Window. Castet er den enkleste veien utenom uten et eget tsconfig for workeren.
const post = (message: FromWorker) => {
    (self as unknown as { postMessage: (message: FromWorker) => void }).postMessage(message);
};

let currentRun = 0;
let abortController: AbortController | null = null;

const loadDem = async (
    request: SearchRequest,
    id: number,
    signal: AbortSignal,
    report: (stage: SearchStage, done: number, total: number) => void,
) => {
    const zoom = pickDemZoom(request.bounds, request.maxTiles);
    const range = tileRangeFor(request.bounds, zoom);
    const grid = gridFor(range);
    const values = new Float32Array(grid.width * grid.height);

    const queue: { x: number; y: number }[] = [];
    for (let y = range.minY; y <= range.maxY; y++) {
        for (let x = range.minX; x <= range.maxX; x++) queue.push({ x, y });
    }

    const total = queue.length;
    let done = 0;
    report("tiles", 0, total);

    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
        for (;;) {
            const tile = queue.pop();
            if (!tile) return;
            if (signal.aborted || id !== currentRun) return;

            const response = await fetch(terrariumTileUrl(zoom, tile.x, tile.y), { signal });
            if (!response.ok) throw new Error(`Høydeflis svarte ${response.status}`);
            const rgba = await decodeTile(await response.blob(), canvas);
            writeTileIntoGrid(values, grid, tile.x, tile.y, rgba);

            done++;
            report("tiles", done, total);
        }
    });

    await Promise.all(workers);
    return { dem: { values, width: grid.width, height: grid.height } satisfies Dem, grid, range };
};

const run = async (id: number, request: SearchRequest) => {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    const startedAt = performance.now();

    let lastReport = 0;
    const report = (stage: SearchStage, done: number, total: number) => {
        const now = performance.now();
        if (now - lastReport < PROGRESS_INTERVAL_MS && done !== total) return;
        lastReport = now;
        if (id === currentRun) post({ type: "progress", id, stage, done, total });
    };

    try {
        const { dem, grid, range } = await loadDem(request, id, controller.signal, report);
        // Et nyere søk har tatt over: dette løpet skal dø uten å si fra.
        if (id !== currentRun) return;

        report("peaks", 0, 1);
        const raw = findPeaks(dem, request.minProminence);
        if (id !== currentRun) return;

        // Toppene finnes i et område med margin rundt kartet. Marginen er der bare for
        // at sadlene skal bli riktige; brukeren skal bare se toppene i sitt eget utsnitt.
        const positioned = raw.map(peak => {
            const [lon, lat] = pixelToLngLat(grid, peak.index);
            return { peak, lon, lat };
        });
        const visible = positioned.filter(entry =>
            containsLngLat(request.visible, entry.lon, entry.lat),
        );

        report("isolation", 0, visible.length);
        const pyramid = buildMaxPyramid(dem);
        if (id !== currentRun) return;

        const scale = metersPerPixel(
            (request.visible.north + request.visible.south) / 2,
            range.zoom,
        );
        const peaks: FoundPeak[] = visible.map((entry, position) => {
            const higher = nearestHigher(pyramid, dem, entry.peak.index);
            report("isolation", position + 1, visible.length);

            let isolation = -1;
            if (higher >= 0) {
                const [higherLon, higherLat] = pixelToLngLat(grid, higher);
                isolation = distanceMeters(entry.lon, entry.lat, higherLon, higherLat);
            }

            const saddleIndex = entry.peak.saddleIndex;
            let saddle: FoundPeak["saddle"] = null;
            if (saddleIndex >= 0) {
                const [saddleLon, saddleLat] = pixelToLngLat(grid, saddleIndex);
                saddle = {
                    lon: saddleLon,
                    lat: saddleLat,
                    elevation: entry.peak.saddleElevation,
                };
            }

            return {
                lon: entry.lon,
                lat: entry.lat,
                elevation: entry.peak.elevation,
                prominence: entry.peak.prominence,
                isolation,
                bounded: entry.peak.bounded,
                saddle,
            };
        });

        if (id !== currentRun) return;
        post({
            type: "result",
            id,
            peaks,
            range,
            metersPerPixel: scale,
            elapsedMs: performance.now() - startedAt,
        });
    } catch (error) {
        if (id !== currentRun) return;
        if (controller.signal.aborted) {
            post({ type: "cancelled", id });
            return;
        }
        post({
            type: "error",
            id,
            message: error instanceof Error ? error.message : "Ukjent feil under analysen",
        });
    }
};

self.onmessage = (event: MessageEvent<ToWorker>) => {
    const message = event.data;
    if (message.type === "cancel") {
        currentRun++;
        abortController?.abort();
        return;
    }
    currentRun = message.id;
    void run(message.id, message.request);
};
