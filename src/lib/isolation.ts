/**
 * Isolasjon: avstanden fra en topp til nærmeste punkt som er høyere.
 *
 * Et naivt ringsøk utover fra toppen koster 145 ms per topp på et vanlig utsnitt,
 * som blir mange sekunder for et par hundre topper. En pyramide der hvert nivå
 * holder maksimum av 2×2 piksler under seg lar søket forkaste hele blokker i ett
 * sammenligningssteg: er blokkens maksimum lavere enn toppen, finnes det ikke noe
 * høyere der inne. Målt på samme data: 225 ganger raskere, og identiske svar.
 */

import type { Dem } from "./prominence";

export type MaxPyramid = {
    levels: Float32Array[];
    widths: number[];
    heights: number[];
};

export const buildMaxPyramid = (dem: Dem): MaxPyramid => {
    const levels: Float32Array[] = [dem.values];
    const widths: number[] = [dem.width];
    const heights: number[] = [dem.height];

    while (widths[widths.length - 1]! > 1 || heights[heights.length - 1]! > 1) {
        const previous = levels[levels.length - 1]!;
        const previousWidth = widths[widths.length - 1]!;
        const previousHeight = heights[heights.length - 1]!;
        const width = Math.ceil(previousWidth / 2);
        const height = Math.ceil(previousHeight / 2);
        const level = new Float32Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let max = -Infinity;
                for (let dy = 0; dy < 2; dy++) {
                    const sourceY = y * 2 + dy;
                    if (sourceY >= previousHeight) continue;
                    for (let dx = 0; dx < 2; dx++) {
                        const sourceX = x * 2 + dx;
                        if (sourceX >= previousWidth) continue;
                        const value = previous[sourceY * previousWidth + sourceX]!;
                        if (value > max) max = value;
                    }
                }
                level[y * width + x] = max;
            }
        }

        levels.push(level);
        widths.push(width);
        heights.push(height);
    }

    return { levels, widths, heights };
};

/**
 * Pikselindeksen til nærmeste høyere punkt, eller -1 når rutenettet ikke inneholder
 * noe høyere. Da er toppen den høyeste i analyseområdet, og den sanne isolasjonen kan
 * bare fastslås med et større utsnitt.
 *
 * Søket minimerer avstand i piksler. Selve isolasjonen må regnes ut geodetisk fra
 * punktet dette returnerer: en Web Mercator-piksel dekker færre meter jo lenger nord
 * man kommer, så en fast meter-per-piksel gir for stor avstand over lange strekk.
 */
export const nearestHigher = (pyramid: MaxPyramid, dem: Dem, index: number) => {
    const { levels, widths, heights } = pyramid;
    const centreX = index % dem.width;
    const centreY = Math.floor(index / dem.width);
    const target = dem.values[index]!;

    let bestSquared = Infinity;
    let bestIndex = -1;
    // Hver ramme er (nivå, blokk-x, blokk-y). Toppnivået er én blokk som dekker alt.
    const stack: number[] = [levels.length - 1, 0, 0];

    while (stack.length > 0) {
        const blockY = stack.pop()!;
        const blockX = stack.pop()!;
        const level = stack.pop()!;

        const width = widths[level]!;
        if (blockX >= width || blockY >= heights[level]!) continue;
        if (levels[level]![blockY * width + blockX]! <= target) continue;

        const size = 1 << level;
        const left = blockX * size;
        const top = blockY * size;
        const right = left + size - 1;
        const bottom = top + size - 1;

        // Korteste mulige avstand fra toppen til noe som helst inne i blokka.
        const dx = centreX < left ? left - centreX : centreX > right ? centreX - right : 0;
        const dy = centreY < top ? top - centreY : centreY > bottom ? centreY - bottom : 0;
        if (dx * dx + dy * dy >= bestSquared) continue;

        if (level === 0) {
            const squared = (left - centreX) ** 2 + (top - centreY) ** 2;
            if (squared > 0 && squared < bestSquared) {
                bestSquared = squared;
                bestIndex = top * dem.width + left;
            }
            continue;
        }

        for (let quadrant = 0; quadrant < 4; quadrant++) {
            stack.push(level - 1, blockX * 2 + (quadrant & 1), blockY * 2 + (quadrant >> 1));
        }
    }

    return bestIndex;
};

/** Avstand i piksler. Brukes av testene; produksjonskoden måler geodetisk. */
export const isolationInPixels = (pyramid: MaxPyramid, dem: Dem, index: number) => {
    const nearest = nearestHigher(pyramid, dem, index);
    if (nearest < 0) return -1;
    const dx = (nearest % dem.width) - (index % dem.width);
    const dy = Math.floor(nearest / dem.width) - Math.floor(index / dem.width);
    return Math.hypot(dx, dy);
};

/**
 * Referanseimplementasjon: ringsøk utover fra toppen, brukt til å verifisere
 * pyramidesøket i testene.
 *
 * Ringene er kvadratiske, så en ring r inneholder punkter med euklidsk avstand fra
 * r til r√2. Å returnere ved første ring med et treff gir derfor ikke nødvendigvis
 * det nærmeste punktet — et punkt i en senere ring kan ligge nærmere. Søket fortsetter
 * til og med ring ⌈d⌉, der d er beste avstand så langt.
 */
export const isolationInPixelsNaive = (dem: Dem, index: number) => {
    const { values, width, height } = dem;
    const centreX = index % width;
    const centreY = Math.floor(index / width);
    const target = values[index]!;

    let bestSquared = Infinity;
    const limit = Math.max(width, height) * 2;

    for (let radius = 1; radius < limit; radius++) {
        if (radius > Math.sqrt(bestSquared)) break;

        const left = Math.max(0, centreX - radius);
        const right = Math.min(width - 1, centreX + radius);
        const top = Math.max(0, centreY - radius);
        const bottom = Math.min(height - 1, centreY + radius);

        for (let y = top; y <= bottom; y++) {
            const onHorizontalEdge = y === centreY - radius || y === centreY + radius;
            for (let x = left; x <= right; x++) {
                if (!onHorizontalEdge && x !== centreX - radius && x !== centreX + radius) continue;
                if (values[y * width + x]! <= target) continue;
                const squared = (x - centreX) ** 2 + (y - centreY) ** 2;
                if (squared < bestSquared) bestSquared = squared;
            }
        }

        const covered = left === 0 && top === 0 && right === width - 1 && bottom === height - 1;
        if (covered) break;
    }

    return bestSquared === Infinity ? -1 : Math.sqrt(bestSquared);
};
