import { describe, expect, test } from "bun:test";
import {
    filterPeaks,
    filtersAtZoom,
    peakId,
    scaleProminenceFloor,
    sortPeaks,
    type NamedPeak,
} from "./peaks";

const peak = (overrides: Partial<NamedPeak>): NamedPeak => ({
    id: "x",
    lon: 8.3,
    lat: 61.6,
    elevation: 2000,
    prominence: 200,
    isolation: 5000,
    bounded: true,
    saddle: null,
    ...overrides,
});

describe("filterPeaks", () => {
    const peaks = [
        peak({ id: "høy", elevation: 2400, prominence: 800, isolation: 12000 }),
        peak({ id: "lav", elevation: 900, prominence: 120, isolation: 2000 }),
        peak({ id: "smal", elevation: 2100, prominence: 60, isolation: 900 }),
    ];

    test("primærfaktor er hovedterskelen", () => {
        const kept = filterPeaks(peaks, { minProminence: 100, minElevation: 0, minIsolation: 0 });
        expect(kept.map(p => p.id)).toEqual(["høy", "lav"]);
    });

    test("tersklene virker sammen, ikke hver for seg", () => {
        const kept = filterPeaks(peaks, {
            minProminence: 100,
            minElevation: 2000,
            minIsolation: 0,
        });
        expect(kept.map(p => p.id)).toEqual(["høy"]);
    });

    test("isolasjonsterskelen luker bort topper tett på noe høyere", () => {
        const kept = filterPeaks(peaks, {
            minProminence: 0,
            minElevation: 0,
            minIsolation: 10000,
        });
        expect(kept.map(p => p.id)).toEqual(["høy"]);
    });

    test("terskler på null slipper alt gjennom", () => {
        expect(
            filterPeaks(peaks, { minProminence: 0, minElevation: 0, minIsolation: 0 }),
        ).toHaveLength(3);
    });
});

describe("scaleProminenceFloor", () => {
    test("strammer terskelen når kartet zoomes ut", () => {
        expect(scaleProminenceFloor(7)).toBe(600);
        expect(scaleProminenceFloor(9.5)).toBe(400);
        expect(scaleProminenceFloor(10.5)).toBe(250);
        expect(scaleProminenceFloor(11.9)).toBe(150);
    });

    test("slipper taket fra zoom 12, der rutenettet er fint nok", () => {
        expect(scaleProminenceFloor(12)).toBe(0);
        expect(scaleProminenceFloor(15)).toBe(0);
    });
});

describe("filtersAtZoom", () => {
    const filters = { minProminence: 100, minElevation: 300, minIsolation: 0 };

    test("gulvet løfter en slappere slider", () => {
        expect(filtersAtZoom(filters, 9.5).minProminence).toBe(400);
    });

    test("en strengere slider vinner over gulvet", () => {
        expect(filtersAtZoom({ ...filters, minProminence: 800 }, 9.5).minProminence).toBe(800);
    });

    test("de andre tersklene røres ikke", () => {
        expect(filtersAtZoom(filters, 7)).toMatchObject({ minElevation: 300, minIsolation: 0 });
    });

    test("Gaustatoppen overlever gulvet på alle zoomnivåer", () => {
        const gausta = peak({ id: "gausta", elevation: 1799, prominence: 860 });
        for (const zoom of [7, 9, 10, 11, 12]) {
            expect(filterPeaks([gausta], filtersAtZoom(filters, zoom))).toHaveLength(1);
        }
    });
});

describe("sortPeaks", () => {
    const peaks = [
        peak({ id: "a", elevation: 2100, prominence: 300, isolation: 4000 }),
        peak({ id: "b", elevation: 2400, prominence: 150, isolation: 9000 }),
    ];

    test("sorterer synkende på valgt nøkkel", () => {
        expect(sortPeaks(peaks, "prominence").map(p => p.id)).toEqual(["a", "b"]);
        expect(sortPeaks(peaks, "elevation").map(p => p.id)).toEqual(["b", "a"]);
        expect(sortPeaks(peaks, "isolation").map(p => p.id)).toEqual(["b", "a"]);
    });

    test("høyden avgjør ved likt utslag", () => {
        const tied = [
            peak({ id: "lav", elevation: 1800, prominence: 200 }),
            peak({ id: "høy", elevation: 2200, prominence: 200 }),
        ];
        expect(sortPeaks(tied, "prominence").map(p => p.id)).toEqual(["høy", "lav"]);
    });

    test("lar den opprinnelige lista være urørt", () => {
        const original = [...peaks];
        sortPeaks(peaks, "elevation");
        expect(peaks).toEqual(original);
    });
});

describe("peakId", () => {
    test("samme posisjon gir samme identitet", () => {
        expect(peakId({ lon: 8.31283, lat: 61.63612 } as NamedPeak)).toBe(
            peakId({ lon: 8.312834, lat: 61.636119 } as NamedPeak),
        );
    });

    test("ulike topper får ulik identitet", () => {
        expect(peakId({ lon: 8.31, lat: 61.63 } as NamedPeak)).not.toBe(
            peakId({ lon: 8.55, lat: 61.65 } as NamedPeak),
        );
    });
});
