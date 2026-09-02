import { formatDistance, formatElevation, formatMetres } from "../lib/format";
import type { NamedPeak } from "../lib/peaks";
import css from "./PeakDetails.module.css";

type Props = {
    peak: NamedPeak;
    onClose: () => void;
};

export const PeakDetails = ({ peak, onClose }: Props) => (
    <article className={css.card}>
        <header className={css.header}>
            <div>
                <h2 className={css.title}>{peak.name ?? "Topp uten navn"}</h2>
                <p className={css.elevation}>{formatElevation(peak.elevation)}</p>
            </div>
            <button type="button" className={css.close} onClick={onClose} aria-label="Lukk">
                ×
            </button>
        </header>

        <dl className={css.facts}>
            <div className={css.fact}>
                <dt>Primærfaktor</dt>
                <dd className="numeric">
                    {peak.bounded ? "" : "~"}
                    {formatMetres(peak.prominence)}
                </dd>
            </div>
            <div className={css.fact}>
                <dt>Isolasjon</dt>
                <dd className="numeric">{formatDistance(peak.isolation)}</dd>
            </div>
            {peak.saddle && (
                <div className={css.fact}>
                    <dt>Nøkkelsadel</dt>
                    <dd className="numeric">
                        {formatElevation(peak.saddle.elevation)}
                        {peak.saddleName && (
                            <span className={css.saddleName}> {peak.saddleName}</span>
                        )}
                    </dd>
                </div>
            )}
            <div className={css.fact}>
                <dt>Posisjon</dt>
                <dd className="numeric">
                    {peak.lat.toFixed(4)}, {peak.lon.toFixed(4)}
                </dd>
            </div>
        </dl>

        {!peak.bounded && (
            <p className={css.note}>
                Sadelen ble ikke funnet innenfor det analyserte området, så primærfaktoren er et
                estimat. Zoom ut og søk på nytt for et sikrere tall.
            </p>
        )}
    </article>
);
