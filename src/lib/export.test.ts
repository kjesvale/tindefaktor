import { describe, expect, test } from "bun:test";
import { toGeoJson, toGpx } from "./export";
import type { NamedPeak } from "./peaks";

const galdhopiggen: NamedPeak = {
    id: "8.31280,61.63610",
    name: "Galdhøpiggen",
    lon: 8.3128,
    lat: 61.6361,
    elevation: 2455.3,
    prominence: 2023.4,
    isolation: 22400,
    bounded: false,
    saddle: null,
};

const named = (name: string): NamedPeak => ({ ...galdhopiggen, id: name, name });

describe("toGpx", () => {
    test("er velformet XML med ett punkt per topp", () => {
        const gpx = toGpx([galdhopiggen, named("Glittertinden")]);
        expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(gpx).toContain('<gpx version="1.1"');
        expect(gpx.trimEnd().endsWith("</gpx>")).toBe(true);
        expect(gpx.match(/<wpt /g)).toHaveLength(2);
    });

    test("tar med koordinat, høyde og navn", () => {
        const gpx = toGpx([galdhopiggen]);
        expect(gpx).toContain('lat="61.636100"');
        expect(gpx).toContain('lon="8.312800"');
        expect(gpx).toContain("<ele>2455.3</ele>");
        expect(gpx).toContain("<name>Galdhøpiggen</name>");
    });

    test("markerer usikker primærfaktor i beskrivelsen", () => {
        expect(toGpx([galdhopiggen])).toContain("Primærfaktor 2023 m (usikker)");
        expect(toGpx([{ ...galdhopiggen, bounded: true }])).toContain("Primærfaktor 2023 m,");
    });

    test("navnløse topper får høyden som navn", () => {
        const gpx = toGpx([{ ...galdhopiggen, name: undefined }]);
        expect(gpx).toContain("<name>2455 moh.</name>");
    });

    test("tegn med særskilt betydning i XML escapes", () => {
        const gpx = toGpx([named('Fjell & <Tind> "A"')]);
        expect(gpx).toContain("Fjell &amp; &lt;Tind&gt; &quot;A&quot;");
        expect(gpx).not.toContain("<Tind>");
    });

    test("en tom liste gir fortsatt gyldig XML", () => {
        const gpx = toGpx([]);
        expect(gpx).toContain("<gpx");
        expect(gpx).not.toContain("<wpt");
    });
});

describe("toGeoJson", () => {
    test("er en FeatureCollection med posisjon som lengde- og breddegrad", () => {
        const geojson = toGeoJson([galdhopiggen]);
        expect(geojson.type).toBe("FeatureCollection");
        expect(geojson.features).toHaveLength(1);
        expect(geojson.features[0]!.geometry.coordinates).toEqual([8.3128, 61.6361]);
    });

    test("tar vare på egenskapene som skiller toppene", () => {
        const properties = toGeoJson([galdhopiggen]).features[0]!.properties;
        expect(properties.name).toBe("Galdhøpiggen");
        expect(properties.elevation).toBe(2455.3);
        expect(properties.prominence).toBe(2023.4);
        expect(properties.isolation).toBe(22400);
        expect(properties.bounded).toBe(false);
    });

    test("ukjent isolasjon skrives som null, ikke som -1", () => {
        const properties = toGeoJson([{ ...galdhopiggen, isolation: -1 }]).features[0]!.properties;
        expect(properties.isolation).toBeNull();
    });

    test("kan serialiseres med JSON.stringify", () => {
        expect(() => JSON.stringify(toGeoJson([galdhopiggen]))).not.toThrow();
    });
});
