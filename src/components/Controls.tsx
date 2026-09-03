import classNames from "classnames";
import { formatCount, formatDuration } from "../lib/format";
import { baseLayerNames, type BaseLayer } from "../lib/mapStyle";
import type { Filters } from "../lib/peaks";
import type { SearchState } from "../hooks/usePeakSearch";
import css from "./Controls.module.css";
import { Slider } from "./Slider";

const stageText: Record<string, string> = {
    tiles: "Laster høydedata",
    peaks: "Finner topper",
    isolation: "Måler isolasjon",
};

type Props = {
    state: SearchState;
    filters: Filters;
    matchCount: number;
    /** Sammenslått bunnark viser bare handlingen og resultatet, ikke tersklene. */
    compact: boolean;
    baseLayer: BaseLayer;
    terrain: boolean;
    onSearch: () => void;
    onCancel: () => void;
    onFiltersChange: (filters: Filters) => void;
    onBaseLayerChange: (layer: BaseLayer) => void;
    onTerrainChange: (terrain: boolean) => void;
};

export const Controls = ({
    state,
    filters,
    matchCount,
    compact,
    baseLayer,
    terrain,
    onSearch,
    onCancel,
    onFiltersChange,
    onBaseLayerChange,
    onTerrainChange,
}: Props) => {
    const running = state.status === "running";
    const fraction = state.total > 0 ? state.done / state.total : 0;

    return (
        <div className={css.controls}>
            {running ? (
                <button type="button" className={css.cancel} onClick={onCancel}>
                    Avbryt
                </button>
            ) : (
                <button type="button" className={css.search} onClick={onSearch}>
                    Finn topper i utsnittet
                </button>
            )}

            {running && (
                <div
                    className={css.progress}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(fraction * 100)}
                >
                    <div className={css.progressTrack}>
                        <div className={css.progressFill} style={{ width: `${fraction * 100}%` }} />
                    </div>
                    <span className={css.progressText}>
                        {stageText[state.stage ?? "tiles"]}
                        {state.total > 1 && ` · ${state.done} av ${state.total}`}
                    </span>
                </div>
            )}

            {state.status === "error" && (
                <p className={css.error} role="alert">
                    {state.message}
                </p>
            )}

            {state.status === "done" && (
                <p className={css.summary}>
                    {formatCount(matchCount, "topp", "topper")} over tersklene
                    {state.elapsedMs !== null && ` · ${formatDuration(state.elapsedMs)}`}
                    {state.metersPerPixel !== null &&
                        ` · ${Math.round(state.metersPerPixel)} m rutenett`}
                    {state.naming && " · henter navn…"}
                </p>
            )}

            {!compact && (
                <>
                    <fieldset className={css.group}>
                        <legend className="eyebrow">Terskler</legend>
                        <Slider
                            label="Primærfaktor"
                            value={filters.minProminence}
                            max={1000}
                            step={10}
                            hint="Hvor høyt fjellet reiser seg over sadelen til nærmeste høyere topp"
                            onChange={minProminence =>
                                onFiltersChange({ ...filters, minProminence })
                            }
                        />
                        <Slider
                            label="Minste høyde"
                            value={filters.minElevation}
                            max={2500}
                            step={50}
                            onChange={minElevation => onFiltersChange({ ...filters, minElevation })}
                        />
                        <Slider
                            label="Minste isolasjon"
                            value={filters.minIsolation}
                            max={20000}
                            step={250}
                            hint="Avstand til nærmeste punkt som er høyere"
                            onChange={minIsolation => onFiltersChange({ ...filters, minIsolation })}
                        />
                    </fieldset>

                    <fieldset className={css.group}>
                        <legend className="eyebrow">Kart</legend>
                        <div className={css.options} role="group" aria-label="Bakgrunnskart">
                            {(Object.keys(baseLayerNames) as BaseLayer[]).map(layer => (
                                <button
                                    key={layer}
                                    type="button"
                                    className={classNames(
                                        css.option,
                                        layer === baseLayer && css.active,
                                    )}
                                    aria-pressed={layer === baseLayer}
                                    onClick={() => onBaseLayerChange(layer)}
                                >
                                    {baseLayerNames[layer]}
                                </button>
                            ))}
                        </div>
                        <label className={css.toggle}>
                            <input
                                type="checkbox"
                                checked={terrain}
                                onChange={event => onTerrainChange(event.target.checked)}
                            />
                            <span>
                                Skyggerelieff og 3D
                                <span className={css.toggleHint}>
                                    Bruker høydedataene som allerede er lastet ned
                                </span>
                            </span>
                        </label>
                    </fieldset>
                </>
            )}
        </div>
    );
};
