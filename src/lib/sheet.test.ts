import { describe, expect, test } from "bun:test";
import { DRAG_THRESHOLD, sheetFromDrag, toggleSheet } from "./sheet";

describe("toggleSheet", () => {
    test("veksler begge veier", () => {
        expect(toggleSheet("collapsed")).toBe("expanded");
        expect(toggleSheet("expanded")).toBe("collapsed");
    });
});

describe("sheetFromDrag", () => {
    test("å dra oppover utvider arket", () => {
        expect(sheetFromDrag(-DRAG_THRESHOLD)).toBe("expanded");
        expect(sheetFromDrag(-200)).toBe("expanded");
    });

    test("å dra nedover slår arket sammen", () => {
        expect(sheetFromDrag(DRAG_THRESHOLD)).toBe("collapsed");
        expect(sheetFromDrag(200)).toBe("collapsed");
    });

    test("en kort bevegelse er ennå ikke et dra", () => {
        expect(sheetFromDrag(0)).toBeNull();
        expect(sheetFromDrag(DRAG_THRESHOLD - 1)).toBeNull();
        expect(sheetFromDrag(-(DRAG_THRESHOLD - 1))).toBeNull();
    });
});
