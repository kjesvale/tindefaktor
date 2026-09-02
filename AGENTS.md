# Retningslinjer for språkmodeller

## Kommentarer

Ikke skriv kommentarer med mindre det er nødvendig. Foretrekk selvbeskrivende kode:
gode navn forklarer som regel det en kommentar ellers ville sagt, og de blir ikke
utdaterte når koden endres.

En kommentar er nødvendig først når koden ikke kan fortelle _hvorfor_ den ser ut som
den gjør — en ikke-åpenbar avveining, en omvei rundt en feil i et bibliotek, eller en
antakelse som ikke er synlig i koden selv. Kommenter da hvorfor, aldri hva.

## Språk

Kommentarer og brukervendt tekst skrives på norsk. Kode skrives på engelsk.

## Kode

Named exports, aldri `export default` — unntaket er `vite.config.ts`, som Vite krever.
Komponenter er arrow functions med en lokal `type Props`. Ingen `interface`, ingen
`React.FC`. Rene funksjoner hører hjemme i `src/lib/` uten React-import, og testes der.

## Fallgruver som allerede har bitt

- **Høyder må kvantiseres til desimeter** før prominensberegningen. Se `prominence.ts`.
- **`optimizeDeps.exclude: ["maplibre-gl"]`** må stå. MapLibre bygger URL-en til sin
  egen worker fra `import.meta.url`, og Vites prebundling flytter biblioteket bort fra
  worker-filen.
- **Kartcontaineren må ha eksplisitt høyde**, ikke `inset: 0`. MapLibre setter
  `position: relative` på containeren og overstyrer absolutt posisjonering.
- **`colorSpaceConversion: "none"`** ved dekoding av høydefliser. Med fargestyring på
  justerer nettleseren RGB-verdiene, og da er de ikke lenger høyder.

## Kommandoer

Kjør `bun run lint`, `bun test` og `bun run build` før en endring meldes som ferdig.
`bun run verify` kontrollerer analysen mot ekte høydedata.
