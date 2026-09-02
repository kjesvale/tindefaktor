import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useMapLibre } from "../hooks/useMapLibre";
import { TERRAIN_SOURCE, type BaseLayer } from "../lib/mapStyle";
import type { NamedPeak } from "../lib/peaks";
import type { ViewState } from "../lib/urlState";
import css from "./MapView.module.css";
import { PeakLabels } from "./PeakLabels";

const PEAK_SOURCE = "topper";
const SADDLE_SOURCE = "sadler";

const emptyCollection = { type: "FeatureCollection", features: [] } as const;

const peakCollection = (peaks: NamedPeak[]) => ({
    type: "FeatureCollection" as const,
    features: peaks.map(peak => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [peak.lon, peak.lat] },
        properties: { id: peak.id, prominence: peak.prominence, bounded: peak.bounded },
    })),
});

/** Linje fra toppen ned til sadelen som bestemmer primærfaktoren. */
const saddleCollection = (peak: NamedPeak | null) => {
    if (!peak?.saddle) return emptyCollection;
    return {
        type: "FeatureCollection" as const,
        features: [
            {
                type: "Feature" as const,
                geometry: {
                    type: "LineString" as const,
                    coordinates: [
                        [peak.lon, peak.lat],
                        [peak.saddle.lon, peak.saddle.lat],
                    ],
                },
                properties: {},
            },
            {
                type: "Feature" as const,
                geometry: {
                    type: "Point" as const,
                    coordinates: [peak.saddle.lon, peak.saddle.lat],
                },
                properties: { saddle: true },
            },
        ],
    };
};

const addLayers = (map: MapLibreMap) => {
    if (map.getSource(PEAK_SOURCE)) return;

    map.addSource(SADDLE_SOURCE, { type: "geojson", data: emptyCollection });
    map.addSource(PEAK_SOURCE, { type: "geojson", data: emptyCollection });

    map.addLayer({
        id: "sadel-linje",
        type: "line",
        source: SADDLE_SOURCE,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: {
            "line-color": "#c2410c",
            "line-width": 2,
            "line-dasharray": [2, 1.5],
        },
    });
    map.addLayer({
        id: "sadel-punkt",
        type: "circle",
        source: SADDLE_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
            "circle-radius": 5,
            "circle-color": "#c2410c",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
        },
    });

    map.addLayer({
        id: "topp-punkt",
        type: "circle",
        source: PEAK_SOURCE,
        paint: {
            // Størrelsen leser primærfaktoren direkte, så de store fjellene skiller seg ut.
            "circle-radius": [
                "interpolate",
                ["linear"],
                ["get", "prominence"],
                0,
                3,
                300,
                5.5,
                900,
                8,
                2000,
                11,
            ],
            "circle-color": ["case", ["get", "bounded"], "#1d4ed8", "#64748b"],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.92,
        },
    });
    map.addLayer({
        id: "topp-valgt",
        type: "circle",
        source: PEAK_SOURCE,
        filter: ["==", ["get", "id"], ""],
        paint: {
            "circle-radius": 12,
            "circle-color": "#f97316",
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#ffffff",
        },
    });
};

type Props = {
    initialView: ViewState;
    baseLayer: BaseLayer;
    terrain: boolean;
    peaks: NamedPeak[];
    selected: NamedPeak | null;
    onSelect: (peak: NamedPeak | null) => void;
    onMoveEnd: (view: ViewState) => void;
    onMapReady: (map: MapLibreMap) => void;
};

export const MapView = ({
    initialView,
    baseLayer,
    terrain,
    peaks,
    selected,
    onSelect,
    onMoveEnd,
    onMapReady,
}: Props) => {
    const { containerRef, mapRef, map, ready, contextLost } = useMapLibre(initialView, baseLayer);
    const peaksRef = useRef(peaks);
    useEffect(() => {
        peaksRef.current = peaks;
    }, [peaks]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        addLayers(map);
        onMapReady(map);
    }, [mapRef, ready, onMapReady]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        map.getSource<GeoJSONSource>(PEAK_SOURCE)?.setData(peakCollection(peaks));
    }, [mapRef, ready, peaks]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        map.getSource<GeoJSONSource>(SADDLE_SOURCE)?.setData(saddleCollection(selected));
        map.setFilter("topp-valgt", ["==", ["get", "id"], selected?.id ?? ""]);
    }, [mapRef, ready, selected]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;

        if (terrain) {
            map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1.2 });
            map.setLayoutProperty("skyggerelieff", "visibility", "visible");
        } else {
            map.setTerrain(null);
            map.setLayoutProperty("skyggerelieff", "visibility", "none");
        }
    }, [mapRef, ready, terrain]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;

        const handleClick = (event: MapMouseEvent) => {
            const features = map.queryRenderedFeatures(event.point, { layers: ["topp-punkt"] });
            const id = features[0]?.properties?.["id"];
            const peak = peaksRef.current.find(candidate => candidate.id === id);
            onSelect(peak ?? null);
        };
        const showPointer = () => {
            map.getCanvas().style.cursor = "pointer";
        };
        const hidePointer = () => {
            map.getCanvas().style.cursor = "";
        };

        map.on("click", handleClick);
        map.on("mouseenter", "topp-punkt", showPointer);
        map.on("mouseleave", "topp-punkt", hidePointer);
        return () => {
            map.off("click", handleClick);
            map.off("mouseenter", "topp-punkt", showPointer);
            map.off("mouseleave", "topp-punkt", hidePointer);
        };
    }, [mapRef, ready, onSelect]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;

        const handleMoveEnd = () => {
            const centre = map.getCenter();
            onMoveEnd({ lon: centre.lng, lat: centre.lat, zoom: map.getZoom() });
        };
        map.on("moveend", handleMoveEnd);
        return () => {
            map.off("moveend", handleMoveEnd);
        };
    }, [mapRef, ready, onMoveEnd]);

    return (
        <div className={css.wrapper}>
            <div ref={containerRef} className={css.map} />
            <PeakLabels
                map={map}
                peaks={peaks}
                selectedId={selected?.id ?? null}
                onSelect={onSelect}
            />
            {contextLost && (
                <div className={css.lost} role="alert">
                    <p className={css.lostText}>
                        Nettleseren mistet grafikkonteksten til kartet. Det skjer gjerne når siden
                        har vært lastet mange ganger.
                    </p>
                    <button
                        type="button"
                        className={css.reload}
                        onClick={() => window.location.reload()}
                    >
                        Last inn på nytt
                    </button>
                </div>
            )}
        </div>
    );
};
