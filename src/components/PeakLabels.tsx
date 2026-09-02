import classNames from "classnames";
import type { MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";
import { boxAround, placeLabels, type LabelCandidate } from "../lib/labels";
import type { NamedPeak } from "../lib/peaks";
import css from "./PeakLabels.module.css";

/** Grovt anslag på tekstbredde. Å måle hver lapp i DOM-en er for dyrt per kartbevegelse. */
const CHARACTER_WIDTH = 6.6;
const LABEL_PADDING = 16;
const LABEL_HEIGHT = 19;
const MARKER_OFFSET = 9;

type Props = {
    map: MapLibreMap | null;
    peaks: NamedPeak[];
    selectedId: string | null;
    onSelect: (peak: NamedPeak) => void;
};

export const PeakLabels = ({ map, peaks, selectedId, onSelect }: Props) => {
    const [visible, setVisible] = useState<{ peak: NamedPeak; x: number; y: number }[]>([]);

    const reposition = useCallback(() => {
        if (!map) return;
        const canvas = map.getCanvas();
        const viewport = {
            left: 0,
            top: 0,
            right: canvas.clientWidth,
            bottom: canvas.clientHeight,
        };

        const named = peaks.filter(peak => peak.name);
        const candidates: LabelCandidate<{ peak: NamedPeak; x: number; y: number }>[] = named.map(
            peak => {
                const point = map.project([peak.lon, peak.lat]);
                const width = peak.name!.length * CHARACTER_WIDTH + LABEL_PADDING;
                return {
                    item: { peak, x: point.x, y: point.y },
                    box: boxAround(point.x, point.y + MARKER_OFFSET, width, LABEL_HEIGHT),
                };
            },
        );

        setVisible(placeLabels(candidates, viewport));
    }, [map, peaks]);

    useEffect(() => {
        if (!map) return;
        // Første plassering venter på neste frame: kartet har ikke nødvendigvis
        // tegnet ennå når effekten kjører, og da projiserer den til feil punkter.
        const frame = requestAnimationFrame(reposition);
        map.on("move", reposition);
        map.on("resize", reposition);
        return () => {
            cancelAnimationFrame(frame);
            map.off("move", reposition);
            map.off("resize", reposition);
        };
    }, [map, reposition]);

    return (
        <div className={css.layer} aria-hidden>
            {visible.map(({ peak, x, y }) => (
                <button
                    key={peak.id}
                    type="button"
                    className={classNames(css.label, peak.id === selectedId && css.selected)}
                    style={{
                        transform: `translate(-50%, 0) translate(${x}px, ${y + MARKER_OFFSET}px)`,
                    }}
                    onClick={() => onSelect(peak)}
                >
                    {peak.name}
                </button>
            ))}
        </div>
    );
};
