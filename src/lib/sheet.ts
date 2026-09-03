/**
 * Bunnarket på mobil har to høyder: sammenslått, der bare søkeknappen og resultatlinja
 * står framme så kartet får skjermen, og utvidet, som er hele panelet. Håndtaket kan
 * både trykkes og dras, og de to gestene deler denne regningen.
 */

export type SheetState = "collapsed" | "expanded";

/** Kortere bevegelser enn dette leses som et trykk framfor et dra. */
export const DRAG_THRESHOLD = 24;

export const toggleSheet = (state: SheetState): SheetState =>
    state === "expanded" ? "collapsed" : "expanded";

/**
 * Tilstanden et dra peker mot, eller null når bevegelsen ennå er for kort til å være
 * noe annet enn et trykk. `deltaY` er negativ oppover, slik nettleseren regner.
 */
export const sheetFromDrag = (deltaY: number): SheetState | null => {
    if (Math.abs(deltaY) < DRAG_THRESHOLD) return null;
    return deltaY < 0 ? "expanded" : "collapsed";
};
