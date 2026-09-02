/**
 * Høydedata fra AWS sine Terrarium-fliser: en PNG der høyden er kodet i RGB.
 * Datasettet er åpent, krever ingen nøkkel og sender CORS-headere.
 *
 * Nøyaktighet målt mot fasit under planleggingen: Galdhøpiggen ga 2462 m mot 2469 m,
 * med toppunktet 27 m fra riktig posisjon. Prominens er en differanse mellom to
 * høyder, så en systematisk skjevhet i datasettet forsvinner i regnestykket.
 */

import { quantizeElevation } from "./prominence";
import { TILE_SIZE, type Grid } from "./tiles";

export const TERRARIUM_TILE_URL =
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export const terrariumTileUrl = (zoom: number, x: number, y: number) =>
    TERRARIUM_TILE_URL.replace("{z}", String(zoom))
        .replace("{x}", String(x))
        .replace("{y}", String(y));

/** Kvantiseringen er en forutsetning for at prominensberegningen skal bli riktig. */
export const elevationFromRgb = (red: number, green: number, blue: number) =>
    quantizeElevation(red * 256 + green + blue / 256 - 32768);

/** Skriver én dekodet flis inn på riktig plass i det sammensatte rutenettet. */
export const writeTileIntoGrid = (
    target: Float32Array,
    grid: Grid,
    tileX: number,
    tileY: number,
    rgba: Uint8ClampedArray,
) => {
    const originX = (tileX - grid.range.minX) * TILE_SIZE;
    const originY = (tileY - grid.range.minY) * TILE_SIZE;

    for (let y = 0; y < TILE_SIZE; y++) {
        const rowStart = (originY + y) * grid.width + originX;
        for (let x = 0; x < TILE_SIZE; x++) {
            const source = (y * TILE_SIZE + x) * 4;
            target[rowStart + x] = elevationFromRgb(
                rgba[source]!,
                rgba[source + 1]!,
                rgba[source + 2]!,
            );
        }
    }
};

/**
 * Dekoder en flis til rå piksler. `colorSpaceConversion: "none"` er avgjørende:
 * med fargestyring slått på kan nettleseren justere RGB-verdiene, og da er de ikke
 * lenger tall som beskriver høyde.
 */
export const decodeTile = async (blob: Blob, canvas: OffscreenCanvas) => {
    const bitmap = await createImageBitmap(blob, {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
    });
    try {
        const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!context) throw new Error("Fikk ikke 2d-kontekst for flisdekoding");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    } finally {
        bitmap.close();
    }
};
