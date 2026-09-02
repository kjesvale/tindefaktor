/** Eksport av funne topper til GPX for GPS-enheter og GeoJSON for kartverktøy. */

import type { NamedPeak } from "./peaks";

const escapeXml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

const describe = (peak: NamedPeak) => {
    const parts = [`Primærfaktor ${Math.round(peak.prominence)} m`];
    if (!peak.bounded) parts[0] += " (usikker)";
    if (peak.isolation >= 0) parts.push(`isolasjon ${(peak.isolation / 1000).toFixed(1)} km`);
    if (peak.saddle) parts.push(`sadel ${Math.round(peak.saddle.elevation)} m`);
    return parts.join(", ");
};

export const toGpx = (peaks: NamedPeak[], now = new Date()) => {
    const waypoints = peaks
        .map(peak => {
            const name = peak.name ?? `${Math.round(peak.elevation)} moh.`;
            return [
                `    <wpt lat="${peak.lat.toFixed(6)}" lon="${peak.lon.toFixed(6)}">`,
                `        <ele>${peak.elevation.toFixed(1)}</ele>`,
                `        <name>${escapeXml(name)}</name>`,
                `        <desc>${escapeXml(describe(peak))}</desc>`,
                `        <sym>Summit</sym>`,
                `    </wpt>`,
            ].join("\n");
        })
        .join("\n");

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="Tindefaktor" xmlns="http://www.topografix.com/GPX/1/1">',
        "    <metadata>",
        "        <name>Fjelltopper fra Tindefaktor</name>",
        `        <time>${now.toISOString()}</time>`,
        "    </metadata>",
        waypoints,
        "</gpx>",
        "",
    ].join("\n");
};

export const toGeoJson = (peaks: NamedPeak[]) => ({
    type: "FeatureCollection" as const,
    features: peaks.map(peak => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [peak.lon, peak.lat] },
        properties: {
            name: peak.name ?? null,
            elevation: Number(peak.elevation.toFixed(1)),
            prominence: Number(peak.prominence.toFixed(1)),
            isolation: peak.isolation >= 0 ? Math.round(peak.isolation) : null,
            bounded: peak.bounded,
            saddleElevation: peak.saddle ? Number(peak.saddle.elevation.toFixed(1)) : null,
            saddleName: peak.saddleName ?? null,
        },
    })),
});

export const downloadFile = (filename: string, mimeType: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};
