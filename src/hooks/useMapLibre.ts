/** Oppretter kartet én gang og holder det i live så lenge komponenten står. */

import { MapLibreMap, NavigationControl, ScaleControl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { buildStyle, type BaseLayer } from "../lib/mapStyle";
import type { Bounds } from "../lib/tiles";
import type { ViewState } from "../lib/urlState";

export const boundsOf = (map: MapLibreMap): Bounds => {
    const bounds = map.getBounds();
    return {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
    };
};

export const useMapLibre = (initialView: ViewState, baseLayer: BaseLayer) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const [map, setMap] = useState<MapLibreMap | null>(null);
    const [ready, setReady] = useState(false);
    const [contextLost, setContextLost] = useState(false);

    // Startvisningen leses bare ved oppstart; etterpå eier kartet sin egen posisjon.
    const initialViewRef = useRef(initialView);
    const baseLayerRef = useRef(baseLayer);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const map = new MapLibreMap({
            container,
            style: buildStyle(baseLayerRef.current),
            center: [initialViewRef.current.lon, initialViewRef.current.lat],
            zoom: initialViewRef.current.zoom,
            maxZoom: 17,
            maxPitch: 75,
            attributionControl: { compact: true },
        });

        map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
        map.on("load", () => setReady(true));

        // Nettleseren gir hver fane et begrenset antall WebGL-kontekster. Går kartets
        // tapt — typisk etter mange omlastinger i utvikling, eller når skjermkortet
        // tilbakestilles — blir lerretet svart uten noen feilmelding.
        map.on("webglcontextlost", () => setContextLost(true));
        map.on("webglcontextrestored", () => setContextLost(false));

        mapRef.current = map;
        setMap(map);
        return () => {
            setReady(false);
            setMap(null);
            mapRef.current = null;
            map.remove();
        };
    }, []);

    // Bytte av bakgrunnskart bygger stilen på nytt, så lagene må legges til igjen.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        if (baseLayerRef.current === baseLayer) return;

        baseLayerRef.current = baseLayer;
        setReady(false);
        map.setStyle(buildStyle(baseLayer));
        map.once("styledata", () => setReady(true));
    }, [baseLayer, ready]);

    return { containerRef, mapRef, map, ready, contextLost };
};
