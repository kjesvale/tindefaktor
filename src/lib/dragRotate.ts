/**
 * Omregning fra musebevegelse til kameravinkler.
 *
 * Faktorene og fortegnene er de samme som MapLibre bruker for sin egen Ctrl + dra,
 * slik at de to måtene å rotere på oppfører seg likt: dra til høyre svinger kartet
 * med klokka, dra oppover legger kameraet lavere mot horisonten.
 */

export const BEARING_DEGREES_PER_PIXEL = 0.8;
export const PITCH_DEGREES_PER_PIXEL = 0.5;

export type Rotation = {
    bearingDelta: number;
    pitchDelta: number;
};

export const rotationFrom = (deltaX: number, deltaY: number): Rotation => ({
    bearingDelta: deltaX * BEARING_DEGREES_PER_PIXEL,
    // Trekkes fra null framfor å negeres, slik at en bevegelse på null gir 0 og ikke -0.
    pitchDelta: 0 - deltaY * PITCH_DEGREES_PER_PIXEL,
});

/** Sann når museknappen og modifikatoren til sammen betyr «roter kartet». */
export const startsRotation = (event: MouseEvent) =>
    event.button === 0 && Boolean(event.metaKey || event.ctrlKey);
