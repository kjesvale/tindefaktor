/**
 * Cmd + dra roterer og tilter kartet.
 *
 * MapLibre binder dette til Ctrl + dra eller høyre museknapp. På macOS er Ctrl + klikk
 * reservert av systemet til høyreklikk, så Cmd er den tasten som faktisk er ledig.
 * Ctrl beholdes ved siden av, siden det er det MapLibre-brukere kjenner fra før.
 */

import type { MapLibreMap } from "maplibre-gl";
import { useEffect } from "react";
import { rotationFrom, startsRotation } from "../lib/dragRotate";

export const useDragRotate = (map: MapLibreMap | null) => {
    useEffect(() => {
        if (!map) return;
        const container = map.getCanvasContainer();

        let rotating = false;
        let lastX = 0;
        let lastY = 0;

        const stop = () => {
            if (!rotating) return;
            rotating = false;
            map.dragPan.enable();
            container.style.cursor = "";
        };

        const onMouseDown = (event: MouseEvent) => {
            if (!startsRotation(event)) return;
            // Fanges i capture-fasen: uten dette rekker MapLibre å starte panorering,
            // og kartet ville flyttet seg samtidig som det roterte.
            event.preventDefault();
            event.stopPropagation();

            rotating = true;
            lastX = event.clientX;
            lastY = event.clientY;
            map.dragPan.disable();
            container.style.cursor = "grabbing";
        };

        const onMouseMove = (event: MouseEvent) => {
            if (!rotating) return;
            const { bearingDelta, pitchDelta } = rotationFrom(
                event.clientX - lastX,
                event.clientY - lastY,
            );
            lastX = event.clientX;
            lastY = event.clientY;

            // setPitch klemmer selv mot maxPitch, så vi trenger ingen egen grense.
            map.setBearing(map.getBearing() + bearingDelta);
            map.setPitch(map.getPitch() + pitchDelta);
        };

        // Bevegelsen følges på vinduet, slik at rotasjonen ikke henger igjen når
        // pekeren forlater kartet midt i et dra.
        container.addEventListener("mousedown", onMouseDown, true);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", stop);
        window.addEventListener("blur", stop);

        return () => {
            container.removeEventListener("mousedown", onMouseDown, true);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", stop);
            window.removeEventListener("blur", stop);
            stop();
        };
    }, [map]);
};
