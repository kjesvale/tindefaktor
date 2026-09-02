import classNames from "classnames";
import type { MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";
import { boxAround, placeLabels, type LabelCandidate } from "../lib/labels";
import type { NamedPeak } from "../lib/peaks";
import css from "./PeakLabels.module.css";

/**
 * Grove anslag på tekstbredde. Å måle hver lapp i DOM-en er for dyrt når de skal
 * plasseres på nytt for hver eneste kartbevegelse.
 */
const CHARACTER_WIDTH = 6.6;
const DIGIT_WIDTH = 7.4;
const LABEL_PADDING = 22;
const LABEL_HEIGHT = 19;
const MARKER_OFFSET = 11;

type Placed = { peak: NamedPeak; x: number; y: number; elevation: string };

type Props = {
    map: MapLibreMap | null;
    peaks: NamedPeak[];
    selectedId: string | null;
    onSelect: (peak: NamedPeak) => void;
};

export const PeakLabels = ({ map, peaks, selectedId, onSelect }: Props) => {
    const [visible, setVisible] = useState<Placed[]>([]);

    const reposition = useCallback(() => {
        if (!map) return;
        const canvas = map.getCanvas();
        const viewport = {
            left: 0,
            top: 0,
            right: canvas.clientWidth,
            bottom: canvas.clientHeight,
        };

        const candidates: LabelCandidate<Placed>[] = peaks
            .filter(peak => peak.name)
            .map(peak => {
                const point = map.project([peak.lon, peak.lat]);
                const elevation = String(Math.round(peak.elevation));
                const width =
                    peak.name!.length * CHARACTER_WIDTH +
                    elevation.length * DIGIT_WIDTH +
                    LABEL_PADDING;
                return {
                    item: { peak, x: point.x, y: point.y, elevation },
                    box: boxAround(point.x, point.y + MARKER_OFFSET, width, LABEL_HEIGHT),
                };
            });

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

    /**
     * Lappene ligger utenfor kartets eget DOM-tre, så hjul og musetrykk over dem når
     * aldri fram til MapLibre. Uten videresending stopper både zooming og panorering
     * så snart pekeren treffer et fjellnavn.
     */
    const forwardWheel = (event: React.WheelEvent<HTMLElement>) => {
        const container = map?.getCanvasContainer();
        if (!container) return;
        container.dispatchEvent(
            new WheelEvent("wheel", {
                deltaX: event.deltaX,
                deltaY: event.deltaY,
                deltaZ: event.deltaZ,
                deltaMode: event.deltaMode,
                clientX: event.clientX,
                clientY: event.clientY,
                bubbles: true,
                cancelable: true,
            }),
        );
    };

    const forwardMouseDown = (event: React.MouseEvent<HTMLElement>) => {
        const container = map?.getCanvasContainer();
        if (!container) return;
        container.dispatchEvent(
            new MouseEvent("mousedown", {
                clientX: event.clientX,
                clientY: event.clientY,
                button: event.button,
                buttons: event.buttons,
                bubbles: true,
                cancelable: true,
            }),
        );
    };

    return (
        <div className={css.layer}>
            {visible.map(({ peak, x, y, elevation }) => (
                <button
                    key={peak.id}
                    type="button"
                    className={classNames(css.label, peak.id === selectedId && css.selected)}
                    style={{
                        transform: `translate(-50%, 0) translate(${x}px, ${y + MARKER_OFFSET}px)`,
                    }}
                    onWheel={forwardWheel}
                    onMouseDown={forwardMouseDown}
                    onClick={() => onSelect(peak)}
                >
                    {peak.name}
                    <span className={css.elevation}>{elevation}</span>
                </button>
            ))}
        </div>
    );
};
