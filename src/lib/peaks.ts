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

/**
 * Minste primærfaktor som er verdt å tegne ved en gitt zoom. Uten et gulv blir et
 * utzoomet utsnitt et teppe av prikker — Sør-Norge gir 1548 topper over 100 m på en
 * skjermbredde — og de store fjellene drukner mellom naboene sine. Trappen følger
 * samtidig hva rutenettet tåler: på 300 m per piksel er en topp med 20 m primærfaktor
 * uansett støy.
 */
export const scaleProminenceFloor = (zoom: number) => {
    if (zoom < 9) return 600;
    if (zoom < 10) return 400;
    if (zoom < 11) return 250;
    if (zoom < 12) return 150;
    return 0;
};

/** Gulvet er et tillegg, ikke en overstyring: en strengere slider vinner alltid. */
export const filtersAtZoom = (filters: Filters, zoom: number): Filters => ({
    ...filters,
    minProminence: Math.max(filters.minProminence, scaleProminenceFloor(zoom)),
});

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
