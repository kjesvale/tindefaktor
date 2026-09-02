/**
 * Web Mercator-fliser: omregning mellom geografiske koordinater, flisindekser og
 * pikselposisjoner i et sammensatt rutenett av fliser.
 */

export const TILE_SIZE = 256;

export type Bounds = {
    south: number;
    west: number;
    north: number;
    east: number;
};

export type TileRange = {
    zoom: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

/** Web Mercator er udefinert ved polene; dette er den vanlige avskjæringen. */
const MAX_LATITUDE = 85.05112878;

const clampLatitude = (lat: number) => Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, lat));

export const lonToTileFloat = (lon: number, zoom: number) => ((lon + 180) / 360) * 2 ** zoom;

export const latToTileFloat = (lat: number, zoom: number) => {
    const rad = (clampLatitude(lat) * Math.PI) / 180;
    return ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** zoom;
};

export const tileFloatToLon = (x: number, zoom: number) => (x / 2 ** zoom) * 360 - 180;

export const tileFloatToLat = (y: number, zoom: number) => {
    const n = Math.PI * (1 - (2 * y) / 2 ** zoom);
    return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
};

/** Bakkeoppløsning i meter per piksel, som avhenger av breddegrad. */
export const metersPerPixel = (lat: number, zoom: number) =>
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/**
 * Utvider et utsnitt med en andel av bredden og høyden på hver side. Marginen gir
 * union-find-analysen rom til å finne sadler som ligger utenfor det brukeren ser,
 * slik at prominensen ikke blir kunstig lav langs kanten.
 */
export const expandBounds = (bounds: Bounds, factor: number): Bounds => {
    const dLat = (bounds.north - bounds.south) * factor;
    const dLon = (bounds.east - bounds.west) * factor;
    return {
        south: clampLatitude(bounds.south - dLat),
        north: clampLatitude(bounds.north + dLat),
        west: bounds.west - dLon,
        east: bounds.east + dLon,
    };
};

export const tileRangeFor = (bounds: Bounds, zoom: number): TileRange => {
    const limit = 2 ** zoom - 1;
    const clamp = (value: number) => Math.min(limit, Math.max(0, value));
    return {
        zoom,
        minX: clamp(Math.floor(lonToTileFloat(bounds.west, zoom))),
        maxX: clamp(Math.floor(lonToTileFloat(bounds.east, zoom))),
        minY: clamp(Math.floor(latToTileFloat(bounds.north, zoom))),
        maxY: clamp(Math.floor(latToTileFloat(bounds.south, zoom))),
    };
};

export const tileCount = (range: TileRange) =>
    (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);

/**
 * Høyeste zoom der utsnittet får plass innenfor flisbudsjettet. Nedlasting og analyse
 * vokser kvadratisk med zoom, så uten et tak ville et utzoomet kart lastet ned
 * hundrevis av megabyte. Å falle ned et nivå halverer oppløsningen i stedet for å henge.
 */
export const pickDemZoom = (bounds: Bounds, maxTiles: number, min = 8, max = 13) => {
    for (let zoom = max; zoom > min; zoom--) {
        if (tileCount(tileRangeFor(bounds, zoom)) <= maxTiles) return zoom;
    }
    return min;
};

export type Grid = {
    range: TileRange;
    width: number;
    height: number;
};

export const gridFor = (range: TileRange): Grid => ({
    range,
    width: (range.maxX - range.minX + 1) * TILE_SIZE,
    height: (range.maxY - range.minY + 1) * TILE_SIZE,
});

/** Midtpunktet av en rutenettpiksel, i geografiske koordinater. */
export const pixelToLngLat = (grid: Grid, index: number): [number, number] => {
    const px = index % grid.width;
    const py = Math.floor(index / grid.width);
    const zoom = grid.range.zoom;
    const x = grid.range.minX + (px + 0.5) / TILE_SIZE;
    const y = grid.range.minY + (py + 0.5) / TILE_SIZE;
    return [tileFloatToLon(x, zoom), tileFloatToLat(y, zoom)];
};

export const containsLngLat = (bounds: Bounds, lon: number, lat: number) =>
    lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east;

/**
 * Avstand i meter. Equirectangular tilnærming: over et kartutsnitt er feilen langt
 * under oppløsningen i høydedataene, og den er billigere enn haversine per topp.
 */
export const distanceMeters = (lon1: number, lat1: number, lon2: number, lat2: number) => {
    const R = 6371008.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const meanLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
    return Math.hypot(dLat, dLon * Math.cos(meanLat)) * R;
};
