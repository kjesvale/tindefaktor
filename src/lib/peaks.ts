/** Filtrering og sortering av analyseresultatet. Rent UI-nær logikk, uten React. */

import type { FoundPeak } from "./messages";

export type NamedPeak = FoundPeak & {
    id: string;
    name?: string;
    saddleName?: string;
};

export type Filters = {
    minProminence: number;
    minElevation: number;
    minIsolation: number;
};

export type SortKey = "prominence" | "elevation" | "isolation";

export const defaultFilters: Filters = {
    minProminence: 100,
    minElevation: 0,
    minIsolation: 0,
};

export const matchesFilters = (peak: NamedPeak, filters: Filters) =>
    peak.prominence >= filters.minProminence &&
    peak.elevation >= filters.minElevation &&
    peak.isolation >= filters.minIsolation;

export const filterPeaks = (peaks: NamedPeak[], filters: Filters) =>
    peaks.filter(peak => matchesFilters(peak, filters));

export const sortPeaks = (peaks: NamedPeak[], key: SortKey) =>
    [...peaks].sort((a, b) => b[key] - a[key] || b.elevation - a.elevation);

/** Stabil identitet på tvers av oppdateringer, slik at kartet kan spore markører. */
export const peakId = (peak: FoundPeak) => `${peak.lon.toFixed(5)},${peak.lat.toFixed(5)}`;
