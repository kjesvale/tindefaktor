/**
 * Topografisk prominens (primærfaktor) beregnet med union-find over et merge tree.
 *
 * Pikslene behandles i synkende høydeorden. En piksel som ikke har noen behandlet
 * nabo starter en ny komponent og er dermed et lokalt maksimum. En piksel som binder
 * sammen to eller flere komponenter er en sadel: den lavere komponentens topp får
 * prominens = topphøyde − sadelhøyde og er ferdig, og komponentene slås sammen.
 *
 * Dette er definisjonen av prominens, ikke en tilnærming, og sadelen faller ut av
 * algoritmen uten ekstra arbeid.
 */

/**
 * Høydene kvantiseres til desimeter fordi counting sort grupperer i desimeterbøtter.
 * Med finere oppløsning i verdiene enn i sorteringsnøkkelen kan to piksler i samme
 * bøtte behandles i feil rekkefølge, og resultatet er en «topp» som ikke er et strengt
 * lokalt maksimum. Målt på Jotunheimen: 3 av 127 topper, med avvik ned i 0,027 m —
 * nok til at isolasjonssøket fant en høyere nabo rett ved siden av og rapporterte
 * 0 km isolasjon for et fjell med 784 m prominens.
 */
export const ELEVATION_STEP = 0.1;

export const quantizeElevation = (meters: number) =>
    Math.round(meters / ELEVATION_STEP) * ELEVATION_STEP;

export type Dem = {
    values: Float32Array;
    width: number;
    height: number;
};

export type Peak = {
    /** Pikselindeks i rutenettet. */
    index: number;
    elevation: number;
    prominence: number;
    /** Pikselindeksen til nøkkelsadelen, eller -1 for utsnittets høyeste topp. */
    saddleIndex: number;
    saddleElevation: number;
    /**
     * Sann når nøkkelsadelen ble funnet uten at komponenten rørte kanten av rutenettet.
     * Er den usann, kan den virkelige sadelen ligge utenfor analyseområdet, og
     * prominensen er da et estimat.
     */
    bounded: boolean;
};

/** Path halving holder trærne flate uten å allokere. */
const findRoot = (parent: Int32Array, start: number) => {
    let node = start;
    while (parent[node] !== node) {
        const grandparent = parent[parent[node]!]!;
        parent[node] = grandparent;
        node = grandparent;
    }
    return node;
};

/**
 * Sorterer pikselindeksene synkende etter høyde. Counting sort utnytter at
 * kvantiserte høyder gir få distinkte verdier, og er O(n) der en sammenligningssort
 * ville vært O(n log n) — 53 ms mot flere sekunder for 5,9 millioner piksler.
 */
const sortIndicesByHeightDesc = (values: Float32Array) => {
    const count = values.length;
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < count; i++) {
        const value = values[i]!;
        if (value < lowest) lowest = value;
        if (value > highest) highest = value;
    }

    const bucketCount = Math.round((highest - lowest) / ELEVATION_STEP) + 1;
    const keys = new Int32Array(count);
    const totals = new Int32Array(bucketCount);
    for (let i = 0; i < count; i++) {
        const key = Math.round((values[i]! - lowest) / ELEVATION_STEP);
        keys[i] = key;
        totals[key]!++;
    }

    // Prefikssum bakfra gir høyeste bøtte først.
    const cursor = new Int32Array(bucketCount);
    let offset = 0;
    for (let bucket = bucketCount - 1; bucket >= 0; bucket--) {
        cursor[bucket] = offset;
        offset += totals[bucket]!;
    }

    const order = new Int32Array(count);
    for (let i = 0; i < count; i++) order[cursor[keys[i]!]!++] = i;
    return { order, lowest };
};

export const findPeaks = (dem: Dem, minProminence = 0): Peak[] => {
    const { values, width, height } = dem;
    const count = values.length;
    const { order, lowest } = sortIndicesByHeightDesc(values);

    const parent = new Int32Array(count);
    const componentPeak = new Int32Array(count);
    const touchedEdge = new Uint8Array(count);
    const settled = new Uint8Array(count);

    const neighbourOffsets = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];
    const roots = new Int32Array(8);
    const peaks: Peak[] = [];

    for (let step = 0; step < count; step++) {
        const index = order[step]!;
        const x = index % width;
        const y = (index / width) | 0;
        const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;

        let rootCount = 0;
        for (let n = 0; n < 8; n++) {
            const neighbour = index + neighbourOffsets[n]!;
            if (neighbour < 0 || neighbour >= count) continue;
            // Hindrer at naboskapet vikler seg rundt raden.
            if (Math.abs((neighbour % width) - x) > 1) continue;
            if (!settled[neighbour]) continue;

            const root = findRoot(parent, neighbour);
            let seen = false;
            for (let r = 0; r < rootCount; r++) {
                if (roots[r] === root) {
                    seen = true;
                    break;
                }
            }
            if (!seen) roots[rootCount++] = root;
        }

        parent[index] = index;
        settled[index] = 1;

        if (rootCount === 0) {
            componentPeak[index] = index;
            touchedEdge[index] = onEdge ? 1 : 0;
            continue;
        }

        let survivor = roots[0]!;
        let survivorElevation = values[componentPeak[survivor]!]!;
        for (let r = 1; r < rootCount; r++) {
            const candidate = roots[r]!;
            const elevation = values[componentPeak[candidate]!]!;
            if (elevation > survivorElevation) {
                survivorElevation = elevation;
                survivor = candidate;
            }
        }

        // Alle komponenter utenom den høyeste dør her, og denne pikselen er sadelen deres.
        const saddleElevation = values[index]!;
        for (let r = 0; r < rootCount; r++) {
            const dying = roots[r]!;
            if (dying === survivor) continue;
            const peakIndex = componentPeak[dying]!;
            const elevation = values[peakIndex]!;
            const prominence = elevation - saddleElevation;
            if (prominence >= minProminence) {
                peaks.push({
                    index: peakIndex,
                    elevation,
                    prominence,
                    saddleIndex: index,
                    saddleElevation,
                    bounded: !touchedEdge[dying],
                });
            }
        }

        let edge = onEdge ? 1 : 0;
        for (let r = 0; r < rootCount; r++) {
            edge |= touchedEdge[roots[r]!]!;
            parent[roots[r]!] = index;
        }
        componentPeak[index] = componentPeak[survivor]!;
        touchedEdge[index] = edge;
    }

    // Utsnittets høyeste punkt møter aldri noe høyere. Vi kan bare måle det mot det
    // laveste punktet i rutenettet, så tallet er alltid et estimat.
    const highestIndex = componentPeak[findRoot(parent, order[count - 1]!)]!;
    const highestElevation = values[highestIndex]!;
    if (highestElevation - lowest >= minProminence) {
        peaks.push({
            index: highestIndex,
            elevation: highestElevation,
            prominence: highestElevation - lowest,
            saddleIndex: -1,
            saddleElevation: lowest,
            bounded: false,
        });
    }

    return peaks;
};
