/**
 * Protokollen mellom hovedtråden og analyse-workeren.
 *
 * Fallgruve: en ternary på `type`-feltet utvider diskriminanten og ødelegger
 * innsnevringen på mottakersiden. Skriv heller meldingen ut i sin helhet i hver gren.
 */

import type { Bounds, TileRange } from "./tiles";

export type SearchRequest = {
    bounds: Bounds;
    /** Utsnittet brukeren faktisk ser. Topper utenfor dette filtreres bort til slutt. */
    visible: Bounds;
    maxTiles: number;
    minProminence: number;
};

export type FoundPeak = {
    lon: number;
    lat: number;
    elevation: number;
    prominence: number;
    isolation: number;
    /** Sann når nøkkelsadelen ble funnet innenfor analyseområdet. */
    bounded: boolean;
    saddle: { lon: number; lat: number; elevation: number } | null;
};

export type SearchStage = "tiles" | "peaks" | "isolation";

export type ToWorker = { type: "start"; id: number; request: SearchRequest } | { type: "cancel" };

export type FromWorker =
    | { type: "progress"; id: number; stage: SearchStage; done: number; total: number }
    | {
          type: "result";
          id: number;
          peaks: FoundPeak[];
          range: TileRange;
          metersPerPixel: number;
          elapsedMs: number;
      }
    | { type: "error"; id: number; message: string }
    | { type: "cancelled"; id: number };
