import classNames from "classnames";
import { formatDistance, formatElevation, formatMetres } from "../lib/format";
import type { NamedPeak, SortKey } from "../lib/peaks";
import css from "./PeakList.module.css";

const sortLabels: Record<SortKey, string> = {
    prominence: "Primærfaktor",
    elevation: "Høyde",
    isolation: "Isolasjon",
};

type Props = {
    peaks: NamedPeak[];
    selectedId: string | null;
    sortKey: SortKey;
    onSortChange: (key: SortKey) => void;
    onSelect: (peak: NamedPeak) => void;
};

export const PeakList = ({ peaks, selectedId, sortKey, onSortChange, onSelect }: Props) => (
    <div className={css.panel}>
        <div className={css.header}>
            <span className="eyebrow">Topper</span>
            <div className={css.sort} role="group" aria-label="Sorter etter">
                {(Object.keys(sortLabels) as SortKey[]).map(key => (
                    <button
                        key={key}
                        type="button"
                        className={classNames(css.sortOption, key === sortKey && css.active)}
                        aria-pressed={key === sortKey}
                        onClick={() => onSortChange(key)}
                    >
                        {sortLabels[key]}
                    </button>
                ))}
            </div>
        </div>

        {peaks.length === 0 ? (
            <p className={css.empty}>Ingen topper over tersklene i dette utsnittet.</p>
        ) : (
            <ol className={css.list}>
                {peaks.map(peak => (
                    <li key={peak.id}>
                        <button
                            type="button"
                            className={classNames(css.row, peak.id === selectedId && css.selected)}
                            onClick={() => onSelect(peak)}
                        >
                            <span className={css.name}>
                                {peak.name ?? <span className={css.unnamed}>Uten navn</span>}
                                <span className={css.elevation}>
                                    {formatElevation(peak.elevation)}
                                </span>
                            </span>
                            <span className={css.stats}>
                                <span className={classNames(css.prominence, "numeric")}>
                                    {!peak.bounded && (
                                        <abbr
                                            className={css.uncertain}
                                            title="Sadelen kan ligge utenfor området som ble analysert, så tallet er et estimat"
                                        >
                                            ~
                                        </abbr>
                                    )}
                                    {formatMetres(peak.prominence)}
                                </span>
                                <span className={`${css.isolation} numeric`}>
                                    {formatDistance(peak.isolation)}
                                </span>
                            </span>
                        </button>
                    </li>
                ))}
            </ol>
        )}
    </div>
);
