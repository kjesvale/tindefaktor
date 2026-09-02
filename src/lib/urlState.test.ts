import { describe, expect, test } from "bun:test";
import { defaultFilters } from "./peaks";
import { defaultView, parseAppState, serialiseAppState, type AppState } from "./urlState";

describe("parseAppState", () => {
    test("en tom adresse gir standardvisningen", () => {
        const state = parseAppState("");
        expect(state.view).toEqual(defaultView);
        expect(state.filters).toEqual(defaultFilters);
        expect(state.terrain).toBe(false);
    });

    test("leser utsnitt og terskler", () => {
        const state = parseAppState("?lat=61.6&lon=8.3&z=11.5&prom=250&ele=1500&iso=3000&3d=1");
        expect(state.view).toEqual({ lat: 61.6, lon: 8.3, zoom: 11.5 });
        expect(state.filters).toEqual({
            minProminence: 250,
            minElevation: 1500,
            minIsolation: 3000,
        });
        expect(state.terrain).toBe(true);
    });

    test("tull i adressefeltet faller tilbake på standardverdier", () => {
        const state = parseAppState("?lat=fjell&prom=");
        expect(state.view.lat).toBe(defaultView.lat);
        expect(state.filters.minProminence).toBe(defaultFilters.minProminence);
    });

    test("parametere som mangler påvirker ikke de andre", () => {
        const state = parseAppState("?prom=300");
        expect(state.filters.minProminence).toBe(300);
        expect(state.view).toEqual(defaultView);
    });
});

describe("serialiseAppState", () => {
    const state: AppState = {
        view: { lat: 61.6363, lon: 8.3129, zoom: 12.3 },
        filters: { minProminence: 250, minElevation: 1500, minIsolation: 3000 },
        terrain: true,
    };

    test("rundtur gir samme tilstand tilbake", () => {
        const parsed = parseAppState(serialiseAppState(state));
        expect(parsed.filters).toEqual(state.filters);
        expect(parsed.terrain).toBe(true);
        expect(parsed.view.lat).toBeCloseTo(state.view.lat, 3);
        expect(parsed.view.lon).toBeCloseTo(state.view.lon, 3);
        expect(parsed.view.zoom).toBeCloseTo(state.view.zoom, 1);
    });

    test("utelater terskler som står på null", () => {
        const query = serialiseAppState({
            ...state,
            filters: { minProminence: 100, minElevation: 0, minIsolation: 0 },
            terrain: false,
        });
        expect(query).not.toContain("ele=");
        expect(query).not.toContain("iso=");
        expect(query).not.toContain("3d=");
        expect(query).toContain("prom=100");
    });

    test("koordinater rundes slik at lenken holder seg lesbar", () => {
        expect(serialiseAppState(state)).toContain("lat=61.6363");
    });
});
