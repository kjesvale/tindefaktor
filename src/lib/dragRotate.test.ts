import { describe, expect, test } from "bun:test";
import {
    BEARING_DEGREES_PER_PIXEL,
    PITCH_DEGREES_PER_PIXEL,
    rotationFrom,
    startsRotation,
} from "./dragRotate";

describe("rotationFrom", () => {
    test("å dra mot høyre svinger kartet med klokka", () => {
        expect(rotationFrom(100, 0).bearingDelta).toBeCloseTo(100 * BEARING_DEGREES_PER_PIXEL, 6);
    });

    test("å dra mot venstre svinger andre veien", () => {
        expect(rotationFrom(-100, 0).bearingDelta).toBeLessThan(0);
    });

    test("å dra oppover legger kameraet lavere mot horisonten", () => {
        // Negativ y er oppover på skjermen, og skal gi større pitch.
        expect(rotationFrom(0, -60).pitchDelta).toBeCloseTo(60 * PITCH_DEGREES_PER_PIXEL, 6);
    });

    test("å dra nedover retter kameraet mot loddrett", () => {
        expect(rotationFrom(0, 60).pitchDelta).toBeLessThan(0);
    });

    test("en bevegelse på null endrer ingenting", () => {
        expect(rotationFrom(0, 0)).toEqual({ bearingDelta: 0, pitchDelta: 0 });
    });
});

describe("startsRotation", () => {
    const event = (overrides: Partial<MouseEvent>) => ({ button: 0, ...overrides }) as MouseEvent;

    test("cmd og venstre knapp roterer", () => {
        expect(startsRotation(event({ metaKey: true }))).toBe(true);
    });

    test("ctrl virker fortsatt, som i MapLibre selv", () => {
        expect(startsRotation(event({ ctrlKey: true }))).toBe(true);
    });

    test("dra uten modifikator panorerer som før", () => {
        expect(startsRotation(event({}))).toBe(false);
    });

    test("høyre museknapp overlates til MapLibre", () => {
        expect(startsRotation(event({ button: 2, metaKey: true }))).toBe(false);
    });
});
