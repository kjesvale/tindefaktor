/**
 * Plassering av navnelapper på kartet.
 *
 * MapLibre sin egen etikettmotor krever PBF-glyphs fra en fonttjeneste. Vi tegner
 * navnene som HTML i stedet, og da må vi selv sørge for at de ikke legger seg oppå
 * hverandre. Lappene tildeles i prioritert rekkefølge, så de mest prominente toppene
 * vinner plassen når det blir trangt.
 */

export type LabelBox = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

export const overlaps = (a: LabelBox, b: LabelBox, padding = 0) =>
    a.left - padding < b.right &&
    a.right + padding > b.left &&
    a.top - padding < b.bottom &&
    a.bottom + padding > b.top;

export const boxAround = (x: number, y: number, width: number, height: number): LabelBox => ({
    left: x - width / 2,
    right: x + width / 2,
    top: y,
    bottom: y + height,
});

export type LabelCandidate<T> = {
    item: T;
    box: LabelBox;
};

/**
 * Beholder lappene som får plass, i den rekkefølgen de kommer inn. Kandidatene må
 * være sortert etter viktighet på forhånd.
 */
export const placeLabels = <T>(
    candidates: LabelCandidate<T>[],
    viewport: LabelBox,
    padding = 2,
): T[] => {
    const placed: LabelBox[] = [];
    const visible: T[] = [];

    for (const candidate of candidates) {
        const { box } = candidate;
        if (
            box.right < viewport.left ||
            box.left > viewport.right ||
            box.bottom < viewport.top ||
            box.top > viewport.bottom
        ) {
            continue;
        }
        if (placed.some(other => overlaps(box, other, padding))) continue;

        placed.push(box);
        visible.push(candidate.item);
    }

    return visible;
};
