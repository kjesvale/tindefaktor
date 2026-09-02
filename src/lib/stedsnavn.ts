/**
 * Fjellnavn fra Kartverkets stedsnavnregister.
 *
 * API-et har ingen søk på utsnitt — bekreftet i deres egen OpenAPI-spesifikasjon.
 * Eneste romlige inngang er /punkt med en radius på maks 5000 m, så et utsnitt må
 * dekkes med et rutenett av punktsøk. Målt: 72 søk over Jotunheimen tok 1,3 sekunder
 * og ga 704 unike fjellnavn.
 */

import { distanceMeters, type Bounds } from "./tiles";

const ENDPOINT = "https://api.kartverket.no/stedsnavn/v1/punkt";

/** Maksradius API-et tillater. */
export const SEARCH_RADIUS_METERS = 5000;

/**
 * Sirkler med radius r dekker et rutenett fullstendig når sentrene ligger r√2 fra
 * hverandre. Vi trekker fra litt for å tåle at meter-per-grad varierer med breddegrad.
 */
export const GRID_SPACING_METERS = 6800;

const METERS_PER_DEGREE_LAT = 111320;

export type PlaceName = {
    name: string;
    lon: number;
    lat: number;
    type: string;
};

export type NamedPoint = { lon: number; lat: number };

/** Navneobjekttyper som beskriver en fjelltopp. */
const PEAK_TYPES = new Set(["Fjell", "Topp", "Berg", "Haug", "Fjellside", "Nut", "Pigg"]);

/** Navneobjekttyper som beskriver et skar eller en sadel mellom to topper. */
const SADDLE_TYPES = new Set(["Skar", "Sadel", "Bandet", "Eid"]);

export const isPeakType = (type: string) => PEAK_TYPES.has(type);
export const isSaddleType = (type: string) => SADDLE_TYPES.has(type);

/** Sentrene i søkerutenettet som til sammen dekker hele utsnittet. */
export const placeNameGridPoints = (bounds: Bounds, spacing = GRID_SPACING_METERS) => {
    const latStep = spacing / METERS_PER_DEGREE_LAT;
    const midLat = (bounds.north + bounds.south) / 2;
    const lonStep = spacing / (METERS_PER_DEGREE_LAT * Math.cos((midLat * Math.PI) / 180));

    const points: NamedPoint[] = [];
    for (let lat = bounds.south; lat < bounds.north + latStep; lat += latStep) {
        for (let lon = bounds.west; lon < bounds.east + lonStep; lon += lonStep) {
            points.push({ lat: Math.min(lat, bounds.north + latStep), lon });
        }
    }
    return points;
};

type ApiResponse = {
    navn?: {
        navneobjekttype?: string;
        representasjonspunkt?: { nord?: number; øst?: number };
        stedsnavn?: { skrivemåte?: string; navnestatus?: string }[];
    }[];
};

const parseResponse = (body: ApiResponse): PlaceName[] => {
    const places: PlaceName[] = [];
    for (const entry of body.navn ?? []) {
        const type = entry.navneobjekttype;
        const point = entry.representasjonspunkt;
        if (!type || !point || point.nord === undefined || point.øst === undefined) continue;
        if (!isPeakType(type) && !isSaddleType(type)) continue;

        // Hovednavnet er det vedtatte navnet; resten er sidenavn og skrivemåtevarianter.
        const names = entry.stedsnavn ?? [];
        const preferred = names.find(name => name.navnestatus === "hovednavn") ?? names[0];
        const written = preferred?.skrivemåte;
        if (!written) continue;

        places.push({ name: written, lon: point.øst, lat: point.nord, type });
    }
    return places;
};

const fetchPoint = async (point: NamedPoint, signal?: AbortSignal) => {
    const url =
        `${ENDPOINT}?nord=${point.lat.toFixed(5)}&ost=${point.lon.toFixed(5)}` +
        `&koordsys=4258&radius=${SEARCH_RADIUS_METERS}&treffPerSide=500&side=1&utkoordsys=4258`;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Stedsnavn svarte ${response.status}`);
    return parseResponse((await response.json()) as ApiResponse);
};

/**
 * Henter alle fjell- og skarnavn i utsnittet. Enkeltsøk som feiler hoppes over:
 * navn er en forbedring av resultatet, ikke en forutsetning for det, så et hull i
 * dekningen skal ikke velte hele analysen.
 */
export const fetchPlaceNames = async (
    bounds: Bounds,
    signal?: AbortSignal,
    concurrency = 6,
): Promise<PlaceName[]> => {
    const queue = placeNameGridPoints(bounds);
    const seen = new Map<string, PlaceName>();

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        for (;;) {
            const point = queue.pop();
            if (!point) return;
            try {
                for (const place of await fetchPoint(point, signal)) {
                    seen.set(
                        `${place.name}@${place.lat.toFixed(5)},${place.lon.toFixed(5)}`,
                        place,
                    );
                }
            } catch (error) {
                if (signal?.aborted) return;
                console.warn("Hoppet over et stedsnavnsøk", error);
            }
        }
    });

    await Promise.all(workers);
    return [...seen.values()];
};

/**
 * Knytter navn til punkter. Et navn kan bare brukes én gang: uten den regelen ville
 * både Galdhøpiggen og Vesle Galdhøpiggen fått navnet til den nærmeste, siden begge
 * ligger innenfor terskelen. Nærmeste par tildeles først.
 */
export const matchNames = <T extends NamedPoint>(
    points: T[],
    places: PlaceName[],
    maxDistanceMeters: number,
): (string | undefined)[] => {
    const pairs: { pointIndex: number; placeIndex: number; distance: number }[] = [];

    for (let p = 0; p < points.length; p++) {
        const point = points[p]!;
        for (let n = 0; n < places.length; n++) {
            const place = places[n]!;
            const distance = distanceMeters(point.lon, point.lat, place.lon, place.lat);
            if (distance <= maxDistanceMeters)
                pairs.push({ pointIndex: p, placeIndex: n, distance });
        }
    }

    pairs.sort((a, b) => a.distance - b.distance);

    const result = new Array<string | undefined>(points.length);
    const usedPlaces = new Set<number>();
    for (const pair of pairs) {
        if (result[pair.pointIndex] !== undefined) continue;
        if (usedPlaces.has(pair.placeIndex)) continue;
        result[pair.pointIndex] = places[pair.placeIndex]!.name;
        usedPlaces.add(pair.placeIndex);
    }
    return result;
};
