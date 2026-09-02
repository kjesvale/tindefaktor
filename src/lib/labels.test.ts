import { describe, expect, test } from "bun:test";
import { boxAround, overlaps, placeLabels, type LabelCandidate } from "./labels";

const viewport = { left: 0, top: 0, right: 1000, bottom: 800 };

describe("overlaps", () => {
    test("kjenner igjen to bokser som dekker hverandre", () => {
        expect(
            overlaps(
                { left: 0, top: 0, right: 10, bottom: 10 },
                { left: 5, top: 5, right: 15, bottom: 15 },
            ),
        ).toBe(true);
    });

    test("bokser ved siden av hverandre er ikke i konflikt", () => {
        expect(
            overlaps(
                { left: 0, top: 0, right: 10, bottom: 10 },
                { left: 11, top: 0, right: 20, bottom: 10 },
            ),
        ).toBe(false);
    });

    test("luft mellom lappene kan kreves med padding", () => {
        const a = { left: 0, top: 0, right: 10, bottom: 10 };
        const b = { left: 11, top: 0, right: 20, bottom: 10 };
        expect(overlaps(a, b, 3)).toBe(true);
    });
});

describe("boxAround", () => {
    test("sentrerer lappen vannrett og henger den under punktet", () => {
        expect(boxAround(100, 50, 80, 20)).toEqual({ left: 60, right: 140, top: 50, bottom: 70 });
    });
});

describe("placeLabels", () => {
    const candidate = (id: string, x: number, y: number): LabelCandidate<string> => ({
        item: id,
        box: boxAround(x, y, 80, 20),
    });

    test("lapper som ikke er i veien for hverandre vises alle", () => {
        const result = placeLabels(
            [candidate("a", 100, 100), candidate("b", 400, 100), candidate("c", 700, 400)],
            viewport,
        );
        expect(result).toEqual(["a", "b", "c"]);
    });

    test("den første i rekkefølgen vinner plassen", () => {
        const result = placeLabels(
            [candidate("viktig", 100, 100), candidate("mindre", 110, 105)],
            viewport,
        );
        expect(result).toEqual(["viktig"]);
    });

    test("lapper utenfor kartflaten hoppes over", () => {
        const result = placeLabels(
            [candidate("innenfor", 500, 400), candidate("utenfor", 5000, 400)],
            viewport,
        );
        expect(result).toEqual(["innenfor"]);
    });

    test("en lapp som er skjøvet ut hindrer ikke andre i å bli plassert", () => {
        const result = placeLabels(
            [candidate("a", 100, 100), candidate("b", 105, 100), candidate("c", 400, 100)],
            viewport,
        );
        expect(result).toEqual(["a", "c"]);
    });

    test("ingen kandidater gir ingen lapper", () => {
        expect(placeLabels([], viewport)).toEqual([]);
    });
});
