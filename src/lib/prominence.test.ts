import { describe, expect, test } from "bun:test";
import { ELEVATION_STEP, findPeaks, quantizeElevation, type Dem } from "./prominence";

const demFrom = (rows: number[][]): Dem => {
    const height = rows.length;
    const width = rows[0]!.length;
    const values = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) values[y * width + x] = quantizeElevation(rows[y]![x]!);
    }
    return { values, width, height };
};

const byElevationDesc = (peaks: ReturnType<typeof findPeaks>) =>
    [...peaks].sort((a, b) => b.elevation - a.elevation);

describe("findPeaks", () => {
    test("to sidetopper får prominens målt mot hver sin sadel", () => {
        // Ryggen har tre topper: 10 og 8 henger på hovedtoppen 20 via sadler på 5 og 3.
        const dem = demFrom([
            [0, 0, 0, 0, 0, 0, 0],
            [0, 10, 5, 20, 3, 8, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ]);

        const peaks = byElevationDesc(findPeaks(dem));
        expect(peaks).toHaveLength(3);

        const [main, left, right] = peaks;
        expect(main!.elevation).toBeCloseTo(20, 5);
        expect(left!.elevation).toBeCloseTo(10, 5);
        expect(right!.elevation).toBeCloseTo(8, 5);

        expect(left!.prominence).toBeCloseTo(5, 5);
        expect(left!.saddleElevation).toBeCloseTo(5, 5);
        expect(right!.prominence).toBeCloseTo(5, 5);
        expect(right!.saddleElevation).toBeCloseTo(3, 5);
    });

    test("sidetopper med sadel innenfor rutenettet er pålitelige", () => {
        const dem = demFrom([
            [0, 0, 0, 0, 0, 0, 0],
            [0, 10, 5, 20, 3, 8, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ]);

        const peaks = byElevationDesc(findPeaks(dem));
        expect(peaks[1]!.bounded).toBe(true);
        expect(peaks[2]!.bounded).toBe(true);
    });

    test("utsnittets høyeste topp er alltid et estimat", () => {
        const dem = demFrom([
            [0, 0, 0, 0, 0, 0, 0],
            [0, 10, 5, 20, 3, 8, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ]);

        const highest = byElevationDesc(findPeaks(dem))[0]!;
        expect(highest.saddleIndex).toBe(-1);
        expect(highest.bounded).toBe(false);
        expect(highest.prominence).toBeCloseTo(20, 5);
    });

    test("sadelindeksen peker på pikselen som binder toppene sammen", () => {
        const dem = demFrom([
            [0, 0, 0, 0, 0, 0, 0],
            [0, 10, 5, 20, 3, 8, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ]);

        const left = byElevationDesc(findPeaks(dem)).find(peak => peak.elevation === 10)!;
        // Rad 1, kolonne 2 i et rutenett som er 7 bredt.
        expect(left.saddleIndex).toBe(1 * 7 + 2);
    });

    test("et flatt rutenett gir én topp og ingen sadel", () => {
        const dem = demFrom([
            [5, 5, 5],
            [5, 5, 5],
            [5, 5, 5],
        ]);

        const peaks = findPeaks(dem);
        expect(peaks).toHaveLength(1);
        expect(peaks[0]!.prominence).toBeCloseTo(0, 5);
    });

    test("minProminence filtrerer bort de små toppene", () => {
        const dem = demFrom([
            [0, 0, 0, 0, 0, 0, 0],
            [0, 10, 5, 20, 3, 8, 0],
            [0, 0, 0, 0, 0, 0, 0],
        ]);

        expect(findPeaks(dem, 6)).toHaveLength(1);
    });
});

describe("kvantisering", () => {
    const gridOf = (rows: number[][], quantize: boolean): Dem => {
        const height = rows.length;
        const width = rows[0]!.length;
        const values = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = rows[y]![x]!;
                values[y * width + x] = quantize ? quantizeElevation(value) : value;
            }
        }
        return { values, width, height };
    };

    /**
     * To naboer som havner i samme desimeterbøtte, der den laveste har lavest
     * pikselindeks og derfor behandles først. Den starter komponenten og blir stående
     * som dens topp, selv om naboen er høyere. Dette er nøyaktig feilen som ga 0 km
     * isolasjon på et fjell med 784 m prominens: isolasjonssøket fant naboen med én gang.
     */
    const almostEqualNeighbours = [
        [0, 0, 0, 0, 0],
        [0, 100.0, 100.04, 0, 0],
        [0, 0, 0, 0, 0],
    ];

    const highestNeighbourOf = (dem: Dem, index: number) => {
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
        const x = index % dem.width;
        let highest = -Infinity;
        for (const offset of offsets) {
            const neighbour = index + offset;
            if (neighbour < 0 || neighbour >= dem.values.length) continue;
            if (Math.abs((neighbour % dem.width) - x) > 1) continue;
            highest = Math.max(highest, dem.values[neighbour]!);
        }
        return highest;
    };

    const countNonMaxima = (dem: Dem) => {
        let failures = 0;
        for (const peak of findPeaks(dem, 1)) {
            if (highestNeighbourOf(dem, peak.index) > dem.values[peak.index]!) failures++;
        }
        return failures;
    };

    test("uten kvantisering rapporteres en topp som ikke er lokalt maksimum", () => {
        expect(countNonMaxima(gridOf(almostEqualNeighbours, false))).toBe(1);
    });

    test("kvantisering fjerner feilen", () => {
        expect(countNonMaxima(gridOf(almostEqualNeighbours, true))).toBe(0);
    });

    test("invarianten holder over et helt kupert rutenett", () => {
        const width = 160;
        const height = 160;
        const rows: number[][] = [];
        let seed = 12345;
        const random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        for (let y = 0; y < height; y++) {
            const row: number[] = [];
            for (let x = 0; x < width; x++) {
                row.push(Math.sin(x / 11) * 40 + Math.cos(y / 9) * 35 + random() * 3);
            }
            rows.push(row);
        }
        expect(countNonMaxima(gridOf(rows, true))).toBe(0);
    });

    test("kvantisering runder til nærmeste desimeter", () => {
        expect(quantizeElevation(2455.04)).toBeCloseTo(2455.0, 6);
        expect(quantizeElevation(2455.06)).toBeCloseTo(2455.1, 6);
        expect(ELEVATION_STEP).toBe(0.1);
    });
});
