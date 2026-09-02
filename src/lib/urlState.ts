/** Kartutsnitt og terskler i adressefeltet, slik at et søk kan deles som en lenke. */

import { defaultFilters, type Filters } from "./peaks";

export type ViewState = {
    lon: number;
    lat: number;
    zoom: number;
};

/** Jotunheimen: tettest samling av høye topper i landet, og et godt sted å starte. */
export const defaultView: ViewState = { lon: 8.31, lat: 61.62, zoom: 10.5 };

export type AppState = {
    view: ViewState;
    filters: Filters;
    terrain: boolean;
};

const number = (params: URLSearchParams, key: string, fallback: number) => {
    const raw = params.get(key)?.trim();
    // Tom streng blir 0 gjennom Number(), som ville stilt terskelen til null i stedet
    // for å la den stå på standardverdien.
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
};

export const parseAppState = (search: string): AppState => {
    const params = new URLSearchParams(search);
    return {
        view: {
            lon: number(params, "lon", defaultView.lon),
            lat: number(params, "lat", defaultView.lat),
            zoom: number(params, "z", defaultView.zoom),
        },
        filters: {
            minProminence: number(params, "prom", defaultFilters.minProminence),
            minElevation: number(params, "ele", defaultFilters.minElevation),
            minIsolation: number(params, "iso", defaultFilters.minIsolation),
        },
        terrain: params.get("3d") === "1",
    };
};

export const serialiseAppState = (state: AppState) => {
    const params = new URLSearchParams();
    params.set("lat", state.view.lat.toFixed(4));
    params.set("lon", state.view.lon.toFixed(4));
    params.set("z", state.view.zoom.toFixed(1));
    params.set("prom", String(Math.round(state.filters.minProminence)));
    if (state.filters.minElevation > 0)
        params.set("ele", String(Math.round(state.filters.minElevation)));
    if (state.filters.minIsolation > 0)
        params.set("iso", String(Math.round(state.filters.minIsolation)));
    if (state.terrain) params.set("3d", "1");
    return `?${params.toString()}`;
};
