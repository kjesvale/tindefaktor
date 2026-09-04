import classNames from "classnames";
import type { MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "./components/Controls";
import { MapView } from "./components/MapView";
import { PeakDetails } from "./components/PeakDetails";
import { PeakList } from "./components/PeakList";
import { SheetHandle } from "./components/SheetHandle";
import { boundsOf } from "./hooks/useMapLibre";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { BOUNDS_MARGIN, usePeakSearch } from "./hooks/usePeakSearch";
import { downloadFile, toGeoJson, toGpx } from "./lib/export";
import type { BaseLayer } from "./lib/mapStyle";
import {
    filterPeaks,
    filtersAtZoom,
    scaleProminenceFloor,
    sortPeaks,
    type Filters,
    type NamedPeak,
    type SortKey,
} from "./lib/peaks";
import type { SheetState } from "./lib/sheet";
import { expandBounds } from "./lib/tiles";
import { parseAppState, serialiseAppState, type ViewState } from "./lib/urlState";
import css from "./App.module.css";

const initial = parseAppState(window.location.search);

/** Må stemme med brekkpunktet i App.module.css: under dette blir panelet et bunnark. */
const MOBILE = "(max-width: 720px)";

export const App = () => {
    const { state, search, cancel } = usePeakSearch();
    const [filters, setFilters] = useState<Filters>(initial.filters);
    const [view, setView] = useState<ViewState>(initial.view);
    const [terrain, setTerrain] = useState(initial.terrain);
    const [baseLayer, setBaseLayer] = useState<BaseLayer>("topo");
    const [sortKey, setSortKey] = useState<SortKey>("prominence");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sheet, setSheet] = useState<SheetState>("collapsed");
    const mapRef = useRef<MapLibreMap | null>(null);

    const mobile = useMediaQuery(MOBILE);
    // Bunnarket finnes bare på mobil. På bred skjerm står panelet alltid åpent.
    const collapsed = mobile && sheet === "collapsed";

    // Prikkene skal tåle å bli sett på avstand, så terskelen strammes med utzoomingen.
    const scaleFloor = scaleProminenceFloor(view.zoom);

    const visible = useMemo(
        () => sortPeaks(filterPeaks(state.peaks, filtersAtZoom(filters, view.zoom)), sortKey),
        [state.peaks, filters, view.zoom, sortKey],
    );

    const selected = useMemo(
        () => visible.find(peak => peak.id === selectedId) ?? null,
        [visible, selectedId],
    );

    // Adressefeltet holdes i takt med utsnitt og terskler, så et søk kan deles som lenke.
    useEffect(() => {
        const query = serialiseAppState({ view, filters, terrain });
        window.history.replaceState(null, "", query);
    }, [view, filters, terrain]);

    const handleMapReady = useCallback((map: MapLibreMap) => {
        mapRef.current = map;
    }, []);

    const handleSearch = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;
        setSelectedId(null);
        const bounds = boundsOf(map);
        search(expandBounds(bounds, BOUNDS_MARGIN), bounds);
    }, [search]);

    // Et valg handler om det som står på kartet, så arket trekker seg unna og gir
    // kartet — og detaljkortet som legger seg over det — plass til å vise toppen.
    const handleSelect = useCallback((peak: NamedPeak | null) => {
        setSelectedId(peak?.id ?? null);
        if (peak) setSheet("collapsed");
    }, []);

    const handleSelectFromList = useCallback((peak: NamedPeak) => {
        setSelectedId(peak.id);
        mapRef.current?.flyTo({ center: [peak.lon, peak.lat], zoom: 13, duration: 700 });
        setSheet("collapsed");
    }, []);

    return (
        <div className={css.app}>
            <aside className={classNames(css.panel, collapsed && css.collapsed)}>
                {mobile && <SheetHandle state={sheet} onChange={setSheet} />}

                <div className={css.body}>
                    <header className={css.brand}>
                        <h1 className={css.title}>Tindefaktor</h1>
                        <p className={css.tagline}>
                            Finn fjelltopper etter primærfaktor — hvor høyt de reiser seg over
                            sadelen til nærmeste høyere fjell.
                        </p>
                    </header>

                    <Controls
                        state={state}
                        filters={filters}
                        matchCount={visible.length}
                        scaleFloor={scaleFloor > filters.minProminence ? scaleFloor : null}
                        compact={collapsed}
                        baseLayer={baseLayer}
                        terrain={terrain}
                        onSearch={handleSearch}
                        onCancel={cancel}
                        onFiltersChange={setFilters}
                        onBaseLayerChange={setBaseLayer}
                        onTerrainChange={setTerrain}
                    />

                    {!mobile && selected && (
                        <PeakDetails peak={selected} onClose={() => setSelectedId(null)} />
                    )}

                    {!collapsed && state.status === "done" && (
                        <>
                            <PeakList
                                peaks={visible}
                                selectedId={selectedId}
                                sortKey={sortKey}
                                onSortChange={setSortKey}
                                onSelect={handleSelectFromList}
                            />

                            {visible.length > 0 && (
                                <div className={css.exports}>
                                    <button
                                        type="button"
                                        className={css.export}
                                        onClick={() =>
                                            downloadFile(
                                                "tindefaktor.gpx",
                                                "application/gpx+xml",
                                                toGpx(visible),
                                            )
                                        }
                                    >
                                        Last ned GPX
                                    </button>
                                    <button
                                        type="button"
                                        className={css.export}
                                        onClick={() =>
                                            downloadFile(
                                                "tindefaktor.geojson",
                                                "application/geo+json",
                                                JSON.stringify(toGeoJson(visible), null, 2),
                                            )
                                        }
                                    >
                                        Last ned GeoJSON
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </aside>

            <MapView
                initialView={initial.view}
                baseLayer={baseLayer}
                terrain={terrain}
                peaks={visible}
                selected={selected}
                showDetails={mobile}
                onSelect={handleSelect}
                onMoveEnd={setView}
                onMapReady={handleMapReady}
            />
        </div>
    );
};
