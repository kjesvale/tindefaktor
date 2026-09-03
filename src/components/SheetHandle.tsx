import { useRef } from "react";
import { sheetFromDrag, toggleSheet, type SheetState } from "../lib/sheet";
import css from "./SheetHandle.module.css";

type Props = {
    state: SheetState;
    onChange: (state: SheetState) => void;
};

/**
 * Håndtaket til bunnarket på mobil. Det svarer både på et trykk og på et dra, og et
 * dra som har passert terskelen slår inn med én gang — ventet det på at fingeren
 * slapp, ville arket stått stille under hele bevegelsen.
 */
export const SheetHandle = ({ state, onChange }: Props) => {
    const startY = useRef<number | null>(null);
    const dragged = useRef(false);

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        startY.current = event.clientY;
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (startY.current === null || dragged.current) return;
        const next = sheetFromDrag(event.clientY - startY.current);
        if (!next) return;
        dragged.current = true;
        onChange(next);
    };

    // Trykket kommer også etter et dra, og etter tastatur — der finnes ingen peker.
    const handleClick = () => {
        if (dragged.current) return;
        onChange(toggleSheet(state));
    };

    return (
        <button
            type="button"
            className={css.handle}
            aria-expanded={state === "expanded"}
            aria-label={state === "expanded" ? "Vis kartet i stort" : "Vis terskler og topper"}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onClick={handleClick}
        >
            <span className={css.grip} />
        </button>
    );
};
