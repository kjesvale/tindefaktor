import { describe, expect, test } from "bun:test";
import {
    GRID_SPACING_METERS,
    isPeakType,
    isSaddleType,
    matchNames,
    placeNameGridPoints,
    SEARCH_RADIUS_METERS,
    type PlaceName,
} from "./stedsnavn";
import { distanceMeters, type Bounds } from "./tiles";

const jotunheimen: Bounds = { south: 61.4, west: 7.8, north: 61.75, east: 8.7 };

describe("placeNameGridPoints", () => {
    test("hvert punkt i utsnittet dekkes av minst ett søk", () => {
        const points = placeNameGridPoints(jotunheimen);

        // Stikkprøver spredt over utsnittet må alle ligge innenfor en søkeradius.
        for (let i = 0; i <= 10; i++) {
            for (let j = 0; j <= 10; j++) {
                const lat = jotunheimen.south + ((jotunheimen.north - jotunheimen.south) * i) / 10;
                const lon = jotunheimen.west + ((jotunheimen.east - jotunheimen.west) * j) / 10;
                const nearest = Math.min(
                    ...points.map(point => distanceMeters(lon, lat, point.lon, point.lat)),
                );
                expect(nearest).toBeLessThanOrEqual(SEARCH_RADIUS_METERS);
            }
        }
    });

    test("avstanden mellom sirkelsentre gir overlapp, ikke hull", () => {
        // Sirkler dekker et rutenett fullstendig først når senteravstanden er under r√2.
        expect(GRID_SPACING_METERS).toBeLessThan(SEARCH_RADIUS_METERS * Math.SQRT2);
    });

    test("et lite utsnitt gir få søk", () => {
        const small: Bounds = { south: 61.6, west: 8.3, north: 61.62, east: 8.33 };
        expect(placeNameGridPoints(small).length).toBeLessThanOrEqual(4);
    });
});

describe("navneobjekttyper", () => {
    test("skiller topper fra skar", () => {
        expect(isPeakType("Fjell")).toBe(true);
        expect(isPeakType("Topp")).toBe(true);
        expect(isPeakType("Skar")).toBe(false);
        expect(isSaddleType("Skar")).toBe(true);
        expect(isSaddleType("Isbre")).toBe(false);
    });
});

describe("matchNames", () => {
    const place = (name: string, lon: number, lat: number): PlaceName => ({
        name,
        lon,
        lat,
        type: "Fjell",
    });

    test("knytter et punkt til navnet som ligger nærmest", () => {
        const points = [{ lon: 8.3129, lat: 61.6363 }];
        const places = [
            place("Galdhøpiggen", 8.3128, 61.6361),
            place("Glittertinden", 8.5573, 61.6511),
        ];

        expect(matchNames(points, places, 500)).toEqual(["Galdhøpiggen"]);
    });

    test("lar ikke to topper dele samme navn", () => {
        // Uten regelen ville begge fått navnet på fjellet de står nærmest.
        const points = [
            { lon: 8.3128, lat: 61.6361 },
            { lon: 8.31315, lat: 61.63635 },
        ];
        const places = [place("Galdhøpiggen", 8.3128, 61.6361)];

        const matched = matchNames(points, places, 500);
        expect(matched[0]).toBe("Galdhøpiggen");
        expect(matched[1]).toBeUndefined();
    });

    test("nærmeste par vinner når flere kjemper om samme navn", () => {
        const points = [
            { lon: 8.32, lat: 61.64 },
            { lon: 8.3128, lat: 61.6361 },
        ];
        const places = [place("Galdhøpiggen", 8.3128, 61.6361)];

        expect(matchNames(points, places, 2000)).toEqual([undefined, "Galdhøpiggen"]);
    });

    test("navn lenger unna enn terskelen brukes ikke", () => {
        const points = [{ lon: 8.3129, lat: 61.6363 }];
        expect(matchNames(points, [place("Glittertinden", 8.5573, 61.6511)], 500)).toEqual([
            undefined,
        ]);
    });

    test("tomt navneregister gir bare udefinerte treff", () => {
        expect(matchNames([{ lon: 8, lat: 61 }], [], 500)).toEqual([undefined]);
    });
});
