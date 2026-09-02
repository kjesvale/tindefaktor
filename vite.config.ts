import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite sin config-laster leser kun module.default, så dette er prosjektets
// eneste default export.
export default defineConfig({
    plugins: [react()],
    // Må være "es" når workeren opprettes med { type: "module" }. Vite defaulter
    // til "iife", som ikke matcher i produksjonsbygg.
    worker: { format: "es" },
    optimizeDeps: {
        // MapLibre bygger URL-en til sin egen worker ut fra import.meta.url. Blir
        // biblioteket pakket om til node_modules/.vite/deps/, ligger ikke
        // maplibre-gl-worker.mjs ved siden av lenger, og nettleseren får en 404 uten
        // MIME-type — Firefox nekter da å laste workeren og kartet blir svart.
        exclude: ["maplibre-gl"],
    },
    build: { target: "es2022" },
});
