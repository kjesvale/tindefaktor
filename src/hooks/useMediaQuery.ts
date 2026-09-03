/**
 * Følger en mediespørring fra JavaScript. Oppsettet på mobil er ikke bare andre
 * stiler, men andre komponenter — detaljkortet flyttes ut på kartet — og da må React
 * vite hvilket brekkpunkt som gjelder.
 */

import { useMemo, useSyncExternalStore } from "react";

export const useMediaQuery = (query: string) => {
    const [subscribe, getSnapshot] = useMemo(() => {
        const list = window.matchMedia(query);
        return [
            (onChange: () => void) => {
                list.addEventListener("change", onChange);
                return () => list.removeEventListener("change", onChange);
            },
            () => list.matches,
        ] as const;
    }, [query]);

    return useSyncExternalStore(subscribe, getSnapshot);
};
