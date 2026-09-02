/**
 * Broen mellom kartet og analyse-workeren. Meldinger fra workeren mates rett inn i
 * en reducer som actions, slik at hele forløpet — fremdrift, resultat, feil — er ett
 * sted og én type.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { FromWorker, SearchRequest, SearchStage } from "../lib/messages";
import { peakId, type NamedPeak } from "../lib/peaks";
import {
    fetchPlaceNames,
    isPeakType,
    isSaddleType,
    matchNames,
    NAME_RADIUS_METERS,
} from "../lib/stedsnavn";
import type { Bounds } from "../lib/tiles";

/**
 * Flisbudsjett for én analyse. 256 fliser er cirka 17 millioner piksler, som tar
 * under fire sekunder å analysere. Over det blir ventetiden lengre enn tålmodigheten.
 */
export const MAX_TILES = 256;

/** Margin rundt utsnittet, så sadler like utenfor skjermkanten blir med i regnestykket. */
export const BOUNDS_MARGIN = 0.5;

/** Grovfilter i workeren. Slidere under denne verdien ville uansett gitt mest støy. */
export const WORKER_MIN_PROMINENCE = 15;

export type SearchStatus = "idle" | "running" | "done" | "error";

export type SearchState = {
    status: SearchStatus;
    stage: SearchStage | null;
    done: number;
    total: number;
    peaks: NamedPeak[];
    message: string | null;
    elapsedMs: number | null;
    metersPerPixel: number | null;
    naming: boolean;
};

const initialState: SearchState = {
    status: "idle",
    stage: null,
    done: 0,
    total: 0,
    peaks: [],
    message: null,
    elapsedMs: null,
    metersPerPixel: null,
    naming: false,
};

type Action =
    | { type: "started" }
    | { type: "workerMessage"; message: FromWorker }
    | { type: "namingStarted" }
    | { type: "namesResolved"; peaks: NamedPeak[] }
    | { type: "namingFailed" };

const reducer = (state: SearchState, action: Action): SearchState => {
    switch (action.type) {
        case "started":
            return { ...initialState, status: "running", stage: "tiles" };

        case "workerMessage": {
            const message = action.message;
            switch (message.type) {
                case "progress":
                    return {
                        ...state,
                        status: "running",
                        stage: message.stage,
                        done: message.done,
                        total: message.total,
                    };
                case "result":
                    return {
                        ...state,
                        status: "done",
                        stage: null,
                        peaks: message.peaks.map(peak => ({ ...peak, id: peakId(peak) })),
                        elapsedMs: message.elapsedMs,
                        metersPerPixel: message.metersPerPixel,
                    };
                case "error":
                    return { ...state, status: "error", stage: null, message: message.message };
                case "cancelled":
                    return { ...state, status: "idle", stage: null };
            }
            return state;
        }

        case "namingStarted":
            return { ...state, naming: true };

        case "namesResolved":
            return { ...state, naming: false, peaks: action.peaks };

        case "namingFailed":
            return { ...state, naming: false };
    }
};

export const usePeakSearch = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const workerRef = useRef<Worker | null>(null);
    const runIdRef = useRef(0);
    const namingRef = useRef<AbortController | null>(null);
    const searchBoundsRef = useRef<Bounds | null>(null);
    const resolveNamesRef = useRef<(peaks: NamedPeak[], bounds: Bounds) => void>(() => {});

    useEffect(() => {
        const worker = new Worker(new URL("../workers/peaks.worker.ts", import.meta.url), {
            type: "module",
        });
        worker.onmessage = (event: MessageEvent<FromWorker>) => {
            const message = event.data;
            dispatch({ type: "workerMessage", message });

            if (message.type === "result" && searchBoundsRef.current) {
                const named = message.peaks.map(peak => ({ ...peak, id: peakId(peak) }));
                resolveNamesRef.current(named, searchBoundsRef.current);
            }
        };
        workerRef.current = worker;

        // Terminering er også det som frigjør minnet fra forrige analyse, og den
        // håndterer StrictMode sin doble montering i utviklingsmodus.
        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    useEffect(() => () => namingRef.current?.abort(), []);

    const search = useCallback((bounds: Bounds, visible: Bounds) => {
        const worker = workerRef.current;
        if (!worker) return;

        namingRef.current?.abort();
        searchBoundsRef.current = visible;
        const id = ++runIdRef.current;
        const request: SearchRequest = {
            bounds,
            visible,
            maxTiles: MAX_TILES,
            minProminence: WORKER_MIN_PROMINENCE,
        };

        dispatch({ type: "started" });
        worker.postMessage({ type: "start", id, request });
    }, []);

    const cancel = useCallback(() => {
        namingRef.current?.abort();
        workerRef.current?.postMessage({ type: "cancel" });
    }, []);

    /**
     * Navnene hentes etter at toppene er tegnet. Kartverket svarer på under et sekund,
     * men toppene er nyttige med en gang, så de skal ikke vente på navnene sine.
     */
    const resolveNames = useCallback(async (peaks: NamedPeak[], bounds: Bounds) => {
        if (peaks.length === 0) return;

        namingRef.current?.abort();
        const controller = new AbortController();
        namingRef.current = controller;
        dispatch({ type: "namingStarted" });

        try {
            const places = await fetchPlaceNames(bounds, controller.signal);
            if (controller.signal.aborted) return;

            const peakNames = matchNames(
                peaks,
                places.filter(place => isPeakType(place.type)),
                NAME_RADIUS_METERS,
            );

            const saddles = peaks.map(peak => peak.saddle).filter(saddle => saddle !== null);
            const saddleNames = matchNames(
                saddles,
                places.filter(place => isSaddleType(place.type)),
                NAME_RADIUS_METERS,
            );
            const saddleNameByIndex = new Map<number, string>();
            let saddleCursor = 0;
            peaks.forEach((peak, index) => {
                if (!peak.saddle) return;
                const name = saddleNames[saddleCursor++];
                if (name) saddleNameByIndex.set(index, name);
            });

            dispatch({
                type: "namesResolved",
                peaks: peaks.map((peak, index) => ({
                    ...peak,
                    name: peakNames[index],
                    saddleName: saddleNameByIndex.get(index),
                })),
            });
        } catch (error) {
            if (controller.signal.aborted) return;
            console.warn("Klarte ikke hente stedsnavn", error);
            dispatch({ type: "namingFailed" });
        }
    }, []);

    useEffect(() => {
        resolveNamesRef.current = (peaks, bounds) => void resolveNames(peaks, bounds);
    }, [resolveNames]);

    return { state, search, cancel };
};
