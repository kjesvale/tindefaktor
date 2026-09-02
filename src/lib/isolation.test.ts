import { describe, expect, test } from "bun:test";
import { buildMaxPyramid, isolationInPixels, isolationInPixelsNaive } from "./isolation";
import { findPeaks, quantizeElevation, type Dem } from "./prominence";

const demFrom = (rows: number[][]): Dem => {
    const height = rows.length;
    const width = rows[0]!.length;
    const values = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) values[y * width + x] = quantizeElevation(rows[y]![x]!);
    }
    return { values, width, height };
};

const ruggedTerrain = (width: number, height: number): Dem => {
    const values = new Float32Array(width * height);
    let seed = 987654;
    const random = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const shape =
                Math.sin(x / 7) * 300 + Math.cos(y / 5) * 250 + Math.sin((x + y) / 13) * 180;
            values[y * width + x] = quantizeElevation(shape + random() * 20);
        }
    }
    return { values, width, height };
};

describe("buildMaxPyramid", () => {
    test("hvert nivå holder maksimum av de fire under", () => {
        const dem = demFrom([
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
            [13, 14, 15, 16],
        ]);
        const pyramid = buildMaxPyramid(dem);

        expect(pyramid.widths).toEqual([4, 2, 1]);
        expect(Array.from(pyramid.levels[1]!)).toEqual([6, 8, 14, 16]);
        expect(Array.from(pyramid.levels[2]!)).toEqual([16]);
    });

    test("ujevne dimensjoner rundes opp uten å miste piksler", () => {
        const dem = demFrom([
            [1, 9, 4],
            [2, 3, 7],
        ]);
        const pyramid = buildMaxPyramid(dem);

        expect(pyramid.widths[1]).toBe(2);
        expect(pyramid.heights[1]).toBe(1);
        expect(Array.from(pyramid.levels[1]!)).toEqual([9, 7]);
        expect(pyramid.levels[pyramid.levels.length - 1]![0]).toBe(9);
    });
});

describe("isolationInPixels", () => {
    test("finner nærmeste høyere punkt", () => {
        // Toppen på 10 står i midten, med et høyere punkt tre piksler til høyre.
        const dem = demFrom([
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 10, 0, 0, 20, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ]);
        const pyramid = buildMaxPyramid(dem);
        const index = 1 * 7 + 2;

        expect(isolationInPixels(pyramid, dem, index)).toBeCloseTo(3, 6);
    });

    test("måler diagonalt i rette linjer, ikke langs rutenettet", () => {
        const dem = demFrom([
            [0, 0, 0, 0, 0],
            [0, 10, 0, 0, 0],
            [0, 0, 0, 0, 0],
            [0, 0, 0, 20, 0],
            [0, 0, 0, 0, 0],
        ]);
        const pyramid = buildMaxPyramid(dem);

        // Fra (1,1) til (3,3) er den euklidske avstanden √8.
        expect(isolationInPixels(pyramid, dem, 1 * 5 + 1)).toBeCloseTo(Math.sqrt(8), 6);
    });

    test("velger nærmeste punkt selv når et fjernere ligger i en tidligere ring", () => {
        /**
         * Kvadratiske ringer forkludrer avstandsmålingen: punktet på (7,7) ligger i
         * ring 3 med euklidsk avstand 4,24, mens (8,4) først dukker opp i ring 4 men
         * bare er 4,0 unna. Et søk som stopper ved første ring med treff, svarer feil.
         */
        const rows = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
        rows[4]![4] = 10;
        rows[7]![7] = 20;
        rows[4]![8] = 20;
        const dem = demFrom(rows);
        const pyramid = buildMaxPyramid(dem);
        const index = 4 * 9 + 4;

        expect(isolationInPixels(pyramid, dem, index)).toBeCloseTo(4, 6);
        expect(isolationInPixelsNaive(dem, index)).toBeCloseTo(4, 6);
    });

    test("gir -1 når ingenting i rutenettet er høyere", () => {
        const dem = demFrom([
            [0, 0, 0],
            [0, 99, 0],
            [0, 0, 0],
        ]);
        const pyramid = buildMaxPyramid(dem);

        expect(isolationInPixels(pyramid, dem, 1 * 3 + 1)).toBe(-1);
    });

    test("gir nøyaktig samme svar som ringsøket for alle topper i et kupert rutenett", () => {
        const dem = ruggedTerrain(96, 96);
        const pyramid = buildMaxPyramid(dem);
        const peaks = findPeaks(dem, 5);

        expect(peaks.length).toBeGreaterThan(10);
        for (const peak of peaks) {
            expect(isolationInPixels(pyramid, dem, peak.index)).toBeCloseTo(
                isolationInPixelsNaive(dem, peak.index),
                6,
            );
        }
    });

    test("er vesentlig raskere enn ringsøket", () => {
        const dem = ruggedTerrain(256, 256);
        const pyramid = buildMaxPyramid(dem);
        const peaks = findPeaks(dem, 5).slice(0, 40);

        const naiveStart = performance.now();
        for (const peak of peaks) isolationInPixelsNaive(dem, peak.index);
        const naiveMs = performance.now() - naiveStart;

        const pyramidStart = performance.now();
        for (const peak of peaks) isolationInPixels(pyramid, dem, peak.index);
        const pyramidMs = performance.now() - pyramidStart;

        expect(pyramidMs).toBeLessThan(naiveMs);
    });
});
