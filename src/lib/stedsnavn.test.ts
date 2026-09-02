import { afterEach, describe, expect, test } from "bun:test";
import {
    fetchPlaceNames,
    GRID_SPACING_METERS,
    isPeakType,
    isSaddleType,
    matchNames,
    placeNameGridPoints,
    SEARCH_RADIUS_METERS,
    type PlaceName,
} from "./stedsnavn";
import { distanceMeters, type Bounds } from "./tiles";

const jotunheimen: Bounds = { south: 61.4, west: 7.8, north: 61.75, east: 8.7 };

describe("placeNameGridPoints", () => {
    test("hvert punkt i utsnittet dekkes av minst ett søk", () => {
        const points = placeNameGridPoints(jotunheimen);

        // Stikkprøver spredt over utsnittet må alle ligge innenfor en søkeradius.
        for (let i = 0; i <= 10; i++) {
            for (let j = 0; j <= 10; j++) {
                const lat = jotunheimen.south + ((jotunheimen.north - jotunheimen.south) * i) / 10;
                const lon = jotunheimen.west + ((jotunheimen.east - jotunheimen.west) * j) / 10;
                const nearest = Math.min(
                    ...points.map(point => distanceMeters(lon, lat, point.lon, point.lat)),
                );
                expect(nearest).toBeLessThanOrEqual(SEARCH_RADIUS_METERS);
            }
        }
    });

    test("avstanden mellom sirkelsentre gir overlapp, ikke hull", () => {
        // Sirkler dekker et rutenett fullstendig først når senteravstanden er under r√2.
        expect(GRID_SPACING_METERS).toBeLessThan(SEARCH_RADIUS_METERS * Math.SQRT2);
    });

    test("et lite utsnitt gir få søk", () => {
        const small: Bounds = { south: 61.6, west: 8.3, north: 61.62, east: 8.33 };
        expect(placeNameGridPoints(small).length).toBeLessThanOrEqual(4);
    });
});

describe("navneobjekttyper", () => {
    test("skiller topper fra skar", () => {
        expect(isPeakType("Fjell")).toBe(true);
        expect(isPeakType("Topp")).toBe(true);
        expect(isPeakType("Skar")).toBe(false);
        expect(isSaddleType("Skar")).toBe(true);
        expect(isSaddleType("Isbre")).toBe(false);
    });

    test("Ås teller som topp", () => {
        // Lavlandstopper er nesten alltid registrert som Ås, ikke Fjell. Uten denne
        // typen står topper som Lathusåsen i Oslo uten navn, selv om navnet er
        // trykt på kartet rett ved siden av punktet.
        expect(isPeakType("Ås")).toBe(true);
        expect(isPeakType("Høyde")).toBe(true);
    });

    test("landskapsformer som ikke er punkter holdes utenfor", () => {
        // En fjellside er ikke toppen av fjellet, en rygg og en egg er strekninger,
        // og et nes er en landtunge ut i vann.
        expect(isPeakType("Fjellside")).toBe(false);
        expect(isPeakType("Rygg")).toBe(false);
        expect(isPeakType("Egg")).toBe(false);
        expect(isPeakType("Nes")).toBe(false);
        expect(isPeakType("Fjellområde")).toBe(false);
    });
});

describe("matchNames", () => {
    const place = (name: string, lon: number, lat: number): PlaceName => ({
        name,
        lon,
        lat,
        type: "Fjell",
    });

    test("knytter et punkt til navnet som ligger nærmest", () => {
        const points = [{ lon: 8.3129, lat: 61.6363 }];
        const places = [
            place("Galdhøpiggen", 8.3128, 61.6361),
            place("Glittertinden", 8.5573, 61.6511),
        ];

        expect(matchNames(points, places, 500)).toEqual(["Galdhøpiggen"]);
    });

    test("lar ikke to topper dele samme navn", () => {
        // Uten regelen ville begge fått navnet på fjellet de står nærmest.
        const points = [
            { lon: 8.3128, lat: 61.6361 },
            { lon: 8.31315, lat: 61.63635 },
        ];
        const places = [place("Galdhøpiggen", 8.3128, 61.6361)];

        const matched = matchNames(points, places, 500);
        expect(matched[0]).toBe("Galdhøpiggen");
        expect(matched[1]).toBeUndefined();
    });

    test("nærmeste par vinner når flere kjemper om samme navn", () => {
        const points = [
            { lon: 8.32, lat: 61.64 },
            { lon: 8.3128, lat: 61.6361 },
        ];
        const places = [place("Galdhøpiggen", 8.3128, 61.6361)];

        expect(matchNames(points, places, 2000)).toEqual([undefined, "Galdhøpiggen"]);
    });

    test("navn lenger unna enn terskelen brukes ikke", () => {
        const points = [{ lon: 8.3129, lat: 61.6363 }];
        expect(matchNames(points, [place("Glittertinden", 8.5573, 61.6511)], 500)).toEqual([
            undefined,
        ]);
    });

    test("tomt navneregister gir bare udefinerte treff", () => {
        expect(matchNames([{ lon: 8, lat: 61 }], [], 500)).toEqual([undefined]);
    });
});

describe("fetchPlaceNames", () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    const entry = (name: string, type: string) => ({
        navneobjekttype: type,
        representasjonspunkt: { nord: 59.9, øst: 10.6 },
        stedsnavn: [{ skrivemåte: name, navnestatus: "hovednavn" }],
    });

    /**
     * Regresjonstest for hele årsaken til at topper i lavlandet sto uten navn:
     * /punkt tar ikke imot noe typefilter, så et punkt i Oslo gir over 500 treff der
     * side 1 bare inneholder adressenavn. Fjellnavnene ligger på side 2.
     */
    test("henter alle sider, ikke bare den første", async () => {
        const pages = new Map([
            [
                "1",
                {
                    metadata: { totaltAntallTreff: 937, viserTil: 500 },
                    navn: Array.from({ length: 500 }, (_, i) => entry(`Vei ${i}`, "Adressenavn")),
                },
            ],
            [
                "2",
                {
                    metadata: { totaltAntallTreff: 937, viserTil: 937 },
                    navn: [entry("Lathusåsen", "Ås")],
                },
            ],
        ]);

        const requested: string[] = [];
        globalThis.fetch = (async (input: string | URL) => {
            const url = new URL(String(input));
            const page = url.searchParams.get("side") ?? "1";
            requested.push(page);
            return { ok: true, json: async () => pages.get(page) ?? { navn: [] } };
        }) as unknown as typeof fetch;

        const bounds = { south: 59.9, west: 10.6, north: 59.905, east: 10.605 };
        const places = await fetchPlaceNames(bounds, undefined, 1);

        expect(requested).toContain("2");
        expect(places.map(place => place.name)).toContain("Lathusåsen");
    });

    test("stopper når alle treff er hentet", async () => {
        const requested: string[] = [];
        globalThis.fetch = (async (input: string | URL) => {
            requested.push(new URL(String(input)).searchParams.get("side") ?? "1");
            return {
                ok: true,
                json: async () => ({
                    metadata: { totaltAntallTreff: 2, viserTil: 2 },
                    navn: [entry("Kolsåstoppen", "Ås")],
                }),
            };
        }) as unknown as typeof fetch;

        const bounds = { south: 59.9, west: 10.6, north: 59.905, east: 10.605 };
        await fetchPlaceNames(bounds, undefined, 1);

        // Utsnittet dekkes av flere søkepunkter, men ingen av dem skal be om side 2
        // når første side allerede inneholder alle treffene.
        expect(requested.length).toBeGreaterThan(0);
        expect([...new Set(requested)]).toEqual(["1"]);
    });

    test("et søk som feiler velter ikke resten", async () => {
        globalThis.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
        const bounds = { south: 59.9, west: 10.6, north: 59.905, east: 10.605 };

        expect(await fetchPlaceNames(bounds, undefined, 1)).toEqual([]);
    });
});
