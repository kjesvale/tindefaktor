/** Kartstilen: Kartverkets topografiske kart, med høydedataene som skyggelag. */

import type { StyleSpecification } from "maplibre-gl";
import { TERRARIUM_TILE_URL } from "./terrarium";

export const KARTVERKET_TILE_URL =
    "https://cache.kartverket.no/v1/wmts/1.0.0/{layer}/default/webmercator/{z}/{y}/{x}.png";

export type BaseLayer = "topo" | "topograatone";

export const baseLayerNames: Record<BaseLayer, string> = {
    topo: "Topografisk",
    topograatone: "Gråtone",
};

export const TERRAIN_SOURCE = "terreng";
/**
 * Skyggerelieffet får sin egen kilde selv om URL-en er den samme. MapLibre advarer mot
 * å dele én raster-dem-kilde mellom hillshade og 3D-terreng fordi de trenger ulik
 * flisbuffer. Nettleseren serverer den andre kilden fra hurtigbufferet, så det koster
 * ingen ekstra nedlasting.
 */
export const HILLSHADE_SOURCE = "skygge";

const kartverketTiles = (layer: BaseLayer) => KARTVERKET_TILE_URL.replace("{layer}", layer);

export const buildStyle = (layer: BaseLayer): StyleSpecification => ({
    version: 8,
    sources: {
        kartverket: {
            type: "raster",
            tiles: [kartverketTiles(layer)],
            tileSize: 256,
            maxzoom: 18,
            attribution: '<a href="https://www.kartverket.no/">© Kartverket</a>',
        },
        [TERRAIN_SOURCE]: {
            type: "raster-dem",
            tiles: [TERRARIUM_TILE_URL],
            tileSize: 256,
            // Samme koding som analysen leser, så nettleseren gjenbruker flisene
            // den allerede har hentet i stedet for å laste ned noe nytt.
            encoding: "terrarium",
            maxzoom: 14,
            attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>',
        },
        [HILLSHADE_SOURCE]: {
            type: "raster-dem",
            tiles: [TERRARIUM_TILE_URL],
            tileSize: 256,
            encoding: "terrarium",
            maxzoom: 14,
        },
    },
    layers: [
        {
            id: "bakgrunn",
            type: "background",
            paint: { "background-color": "#e8edf2" },
        },
        {
            id: "kartverket",
            type: "raster",
            source: "kartverket",
            paint: { "raster-opacity": 1 },
        },
        {
            id: "skyggerelieff",
            type: "hillshade",
            source: HILLSHADE_SOURCE,
            layout: { visibility: "none" },
            paint: {
                "hillshade-exaggeration": 0.45,
                "hillshade-shadow-color": "#31405a",
                "hillshade-highlight-color": "#ffffff",
                "hillshade-accent-color": "#5a6b85",
            },
        },
    ],
});
