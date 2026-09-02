import { describe, expect, test } from "bun:test";
import {
    distanceMeters,
    expandBounds,
    gridFor,
    latToTileFloat,
    lonToTileFloat,
    metersPerPixel,
    pickDemZoom,
    pixelToLngLat,
    tileCount,
    tileRangeFor,
    type Bounds,
} from "./tiles";

const jotunheimen: Bounds = { south: 61.4, west: 7.8, north: 61.8, east: 8.7 };

describe("flisberegning", () => {
    test("Galdhøpiggen havner i den kjente flisen på zoom 12", () => {
        // Verifisert mot et faktisk nedlastet flisbilde under planleggingen.
        expect(Math.floor(lonToTileFloat(8.31266, 12))).toBe(2142);
        expect(Math.floor(latToTileFloat(61.63614, 12))).toBe(1151);
    });

    test("oppløsningen halveres for hvert zoomnivå", () => {
        const coarse = metersPerPixel(61.6, 12);
        const fine = metersPerPixel(61.6, 13);
        expect(coarse / fine).toBeCloseTo(2, 6);
        // Kjent verdi for Norge: cirka 18 meter per piksel på zoom 12.
        expect(coarse).toBeCloseTo(18.2, 1);
    });

    test("antall fliser stemmer med utstrekningen", () => {
        const range = tileRangeFor(jotunheimen, 12);
        expect(tileCount(range)).toBe(
            (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1),
        );
        expect(tileCount(range)).toBeGreaterThan(0);
    });
});

describe("expandBounds", () => {
    test("legger til margin på alle fire sider", () => {
        const expanded = expandBounds({ south: 60, west: 8, north: 61, east: 9 }, 0.5);
        expect(expanded.south).toBeCloseTo(59.5, 6);
        expect(expanded.north).toBeCloseTo(61.5, 6);
        expect(expanded.west).toBeCloseTo(7.5, 6);
        expect(expanded.east).toBeCloseTo(9.5, 6);
    });

    test("holder seg innenfor Mercator-projeksjonens gyldige breddegrader", () => {
        const expanded = expandBounds({ south: -84, west: 0, north: 84, east: 1 }, 1);
        expect(expanded.north).toBeLessThanOrEqual(85.06);
        expect(expanded.south).toBeGreaterThanOrEqual(-85.06);
    });
});

describe("pickDemZoom", () => {
    test("velger høyeste zoom som holder seg innenfor flisbudsjettet", () => {
        const zoom = pickDemZoom(jotunheimen, 256);
        expect(tileCount(tileRangeFor(jotunheimen, zoom))).toBeLessThanOrEqual(256);
        expect(tileCount(tileRangeFor(jotunheimen, zoom + 1))).toBeGreaterThan(256);
    });

    test("faller ned i oppløsning i stedet for å laste ned hele landet", () => {
        const norway: Bounds = { south: 58, west: 5, north: 71, east: 31 };
        expect(pickDemZoom(norway, 256)).toBeLessThan(pickDemZoom(jotunheimen, 256));
    });

    test("går aldri under laveste tillatte zoom", () => {
        const world: Bounds = { south: -80, west: -179, north: 80, east: 179 };
        expect(pickDemZoom(world, 4, 8, 13)).toBe(8);
    });
});

describe("pixelToLngLat", () => {
    test("piksel null ligger i det nordvestre hjørnet av rutenettet", () => {
        const grid = gridFor(tileRangeFor(jotunheimen, 11));
        const [lon, lat] = pixelToLngLat(grid, 0);
        expect(lon).toBeLessThanOrEqual(jotunheimen.west);
        expect(lat).toBeGreaterThanOrEqual(jotunheimen.north);
    });

    test("nabopiksler ligger omtrent én oppløsningsenhet fra hverandre", () => {
        const grid = gridFor(tileRangeFor(jotunheimen, 12));
        const middle = Math.floor(grid.height / 2) * grid.width + Math.floor(grid.width / 2);
        const [lon1, lat1] = pixelToLngLat(grid, middle);
        const [lon2, lat2] = pixelToLngLat(grid, middle + 1);
        expect(distanceMeters(lon1, lat1, lon2, lat2)).toBeCloseTo(metersPerPixel(lat1, 12), 0);
    });
});

describe("distanceMeters", () => {
    test("kjent avstand: Galdhøpiggen til Glittertinden er cirka 13 km", () => {
        const distance = distanceMeters(8.3129, 61.6363, 8.5573, 61.6511);
        expect(distance / 1000).toBeCloseTo(13, 0);
    });

    test("er null for samme punkt", () => {
        expect(distanceMeters(8.3, 61.6, 8.3, 61.6)).toBe(0);
    });
});
