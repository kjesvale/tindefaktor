import classNames from "classnames";
import type { MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

    if (!map) return null;

    /*
     * Lappene rendres inn i kartets egen canvas-container — samme sted MapLibre
     * henger markørene sine. Utenfor det treet ser MapLibre dem ikke: berøringer
     * slipper bare gjennom når de starter inne i containeren, og lytteren som
     * avslutter et dra sitter på den samme noden. Da måtte hendelsene sendes videre
     * for hånd, og en videresendt mousedown uten tilhørende mouseup lot MapLibre tro
     * at et musedra pågikk for alltid. Det blokkerte panorering med finger til neste
     * trykk landet på kartet — kartet låste seg på mobil.
     */
    return createPortal(
        <div className={css.layer}>
            {visible.map(({ peak, x, y, elevation }) => (
                <button
                    key={peak.id}
                    type="button"
                    data-peak-label
                    className={classNames(css.label, peak.id === selectedId && css.selected)}
                    style={{
                        transform: `translate(-50%, 0) translate(${x}px, ${y + MARKER_OFFSET}px)`,
                    }}
                    onClick={() => onSelect(peak)}
                >
                    {peak.name}
                    <span className={css.elevation}>{elevation}</span>
                </button>
            ))}
        </div>,
        map.getCanvasContainer(),
    );
};
