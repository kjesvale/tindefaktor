import type {
    DataDrivenPropertyValueSpecification,
    GeoJSONSource,
    MapLibreMap,
    MapMouseEvent,
    Point,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useDragRotate } from "../hooks/useDragRotate";
import { useMapLibre } from "../hooks/useMapLibre";
import { TERRAIN_SOURCE, type BaseLayer } from "../lib/mapStyle";
import type { NamedPeak } from "../lib/peaks";
import type { ViewState } from "../lib/urlState";
import css from "./MapView.module.css";
import { PeakDetails } from "./PeakDetails";
import { PeakLabels } from "./PeakLabels";

const PEAK_SOURCE = "topper";
const SADDLE_SOURCE = "sadler";

/** En fingertupp treffer ikke en prikk på fire piksler, så treffet får en romslig boks. */
const TAP_TOLERANCE = 12;

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
            "line-color": "#b4340a",
            "line-width": 2.5,
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

    // Kartverkets kart er lyst og fargerikt, så prikkene trenger en hvit glorie for å
    // ikke drukne i skog, snø og koter. Glorien ligger i et eget lag under punktet.
    const radius: DataDrivenPropertyValueSpecification<number> = [
        "interpolate",
        ["linear"],
        ["get", "prominence"],
        0,
        4,
        300,
        6.5,
        900,
        9,
        2000,
        12,
    ];

    map.addLayer({
        id: "topp-glorie",
        type: "circle",
        source: PEAK_SOURCE,
        paint: {
            "circle-radius": ["+", radius, 2.5],
            "circle-color": "#ffffff",
            "circle-opacity": 0.85,
            "circle-blur": 0.25,
        },
    });

    map.addLayer({
        id: "topp-punkt",
        type: "circle",
        source: PEAK_SOURCE,
        paint: {
            // Størrelsen leser primærfaktoren direkte, så de store fjellene skiller seg ut.
            "circle-radius": radius,
            "circle-color": ["case", ["get", "bounded"], "#0b1f3a", "#5b6b82"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 1,
        },
    });
    map.addLayer({
        id: "topp-valgt",
        type: "circle",
        source: PEAK_SOURCE,
        filter: ["==", ["get", "id"], ""],
        paint: {
            "circle-radius": ["+", radius, 4],
            "circle-color": "#e8590c",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
        },
    });
};

/** Toppen nærmest punktet, blant dem som ligger innenfor trefftoleransen. */
const peakAt = (map: MapLibreMap, point: Point, peaks: NamedPeak[]) => {
    const features = map.queryRenderedFeatures(
        [
            [point.x - TAP_TOLERANCE, point.y - TAP_TOLERANCE],
            [point.x + TAP_TOLERANCE, point.y + TAP_TOLERANCE],
        ],
        { layers: ["topp-punkt"] },
    );
    const hit = new Set(features.map(feature => feature.properties?.["id"]));

    let nearest: NamedPeak | null = null;
    let shortest = Infinity;
    for (const peak of peaks) {
        if (!hit.has(peak.id)) continue;
        const distance = map.project([peak.lon, peak.lat]).dist(point);
        if (distance >= shortest) continue;
        shortest = distance;
        nearest = peak;
    }
    return nearest;
};

type Props = {
    initialView: ViewState;
    baseLayer: BaseLayer;
    terrain: boolean;
    peaks: NamedPeak[];
    selected: NamedPeak | null;
    /** På mobil ligger detaljkortet over kartet i stedet for nede i panelet. */
    showDetails: boolean;
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
    showDetails,
    onSelect,
    onMoveEnd,
    onMapReady,
}: Props) => {
    const { containerRef, mapRef, map, ready, contextLost } = useMapLibre(initialView, baseLayer);
    useDragRotate(map);
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
            // Fjellnavnene ligger i kartets egen container, så et klikk på en lapp
            // bobler hit også. Lappen velger toppen selv; uten dette ville kartet
            // avmarkert den i samme øyeblikk.
            const target = event.originalEvent.target;
            if (target instanceof Element && target.closest("[data-peak-label]")) return;

            onSelect(peakAt(map, event.point, peaksRef.current));
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
            {showDetails && selected && (
                <div className={css.details}>
                    <PeakDetails peak={selected} onClose={() => onSelect(null)} />
                </div>
            )}
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
