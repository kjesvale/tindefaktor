# Tindefaktor

Finn fjelltopper på kartet etter **primærfaktor** — det norske ordet for topografisk
prominens: hvor høyt et fjell reiser seg over den laveste sadelen du må krysse for å
komme til noe høyere. Det er terskelen som avgjør om en topp teller som et eget fjell
eller bare er en skulder på nabofjellet.

Alt regnes ut i nettleseren. Ingen server, ingen API-nøkler.

## Slik virker det

1. Du panorerer kartet dit du vil og trykker **Finn topper i utsnittet**.
2. Appen laster høydedata for utsnittet — pluss 50 % margin, så sadler rett utenfor
   skjermkanten blir med i regnestykket.
3. En Web Worker finner alle toppene, sadlene deres og isolasjonen.
4. Navnene hentes fra Kartverkets stedsnavnregister og festes til toppene etterpå.

Tersklene filtrerer resultatet med én gang. Å dra i primærfaktor-slideren laster
ingenting på nytt — hele resultatsettet ligger allerede i minnet.

Utzoomet strammes terskelen av seg selv. Et utsnitt over hele Sør-Norge rommer 1548
topper med mer enn 100 m primærfaktor, og da drukner de store fjellene i teppet av
prikker: kartet tegner bare topper over 600 m under zoom 9, 400 m på zoom 9, 250 m på
zoom 10 og 150 m på zoom 11. Fra zoom 12 bestemmer slideren alene. Gulvet gjelder bare
visningen — analysen finner de små toppene som før, og de dukker opp igjen med en gang
du zoomer inn.

## Kartnavigasjon

| Handling                         | Gjør                          |
| -------------------------------- | ----------------------------- |
| Dra                              | Panorer                       |
| Rull                             | Zoom                          |
| **Cmd + dra** (eller Ctrl + dra) | Roter og tilt kameraet        |
| Klikk på en topp eller et navn   | Vis detaljer og nøkkelsadelen |

Cmd er lagt til fordi Ctrl + klikk er reservert til høyreklikk på macOS. Fjellnavnene
ligger i kartets egen container og er derfor ikke i veien for noe: et dra som starter
på et navn panorerer, og hjulet zoomer.

På mobil blir panelet et bunnark med to høyder. Sammenslått står bare søkeknappen og
resultatlinja framme, og kartet får resten av skjermen; håndtaket øverst kan trykkes
eller dras for å hente fram terskler og toppliste. Velger du en topp, legger detaljene
seg som et kort over kartet framfor nede i panelet, og arket trekker seg sammen så
kartet har plass til å vise toppen.

## Algoritmen

Prominens beregnes med **union-find over et merge tree**, som er definisjonen av
prominens og ikke en tilnærming. Pikslene behandles i synkende høydeorden:

- Ingen behandlet nabo → ny komponent, altså et lokalt maksimum.
- Én komponent → pikselen hører til den.
- To eller flere komponenter → pikselen er en **sadel**. Den lavere komponentens topp
  får `prominens = topphøyde − sadelhøyde` og er ferdig; komponentene slås sammen.

Sadelen du ser tegnet på kartet faller altså ut av algoritmen selv, uten ekstra arbeid.

Tre ting må gjøres riktig, og alle tre er dekket av tester:

|                                            | Hvorfor                                                                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kvantiser høyder til desimeter**         | Counting sort grupperer i desimeterbøtter. Med finere oppløsning i verdiene kan naboer sorteres i feil rekkefølge, og resultatet er en «topp» som ikke er et lokalt maksimum. Det ga en gang 0 km isolasjon på et fjell med 784 m primærfaktor. |
| **Counting sort, ikke sammenligningssort** | Kvantiserte høyder gir få distinkte verdier, så sorteringen blir O(n): 53 ms for 5,9 millioner piksler.                                                                                                                                         |
| **Maks-pyramide for isolasjon**            | Et ringsøk koster 145 ms per topp. En pyramide der hvert nivå holder maksimum av 2×2 lar søket forkaste hele blokker: 225 ganger raskere, identiske svar.                                                                                       |

### Hva tallene tåler

Høydedataene bygger på SRTM med rundt 30 m oppløsning. Målt mot Kartverkets laserdata
i samme punkt treffer de bedre enn ryktet skulle tilsi — Surtningssue på 0,1 m,
Voksenåsen på 0,7 m, Lathusåsen på 1,9 m. Spisse tinder rammes hardest, fordi
rutenettet midler over hele toppartiet: Store Skagastølstind kommer ut 16 m for lavt.

Primærfaktor er dessuten en _differanse_ mellom to høyder, så en jevn skjevhet i
datasettet forsvinner i regnestykket.

Topper merket med **~** har en primærfaktor som er et estimat: sadelen ble ikke funnet
innenfor det analyserte området. Zoom ut og søk på nytt for et sikrere tall.

## Datakilder

| Formål        | Kilde                                                                               |
| ------------- | ----------------------------------------------------------------------------------- |
| Bakgrunnskart | [Kartverket](https://www.kartverket.no/) WMTS, topografisk og gråtone               |
| Høydedata     | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), Terrarium-koding |
| Fjellnavn     | [Kartverkets stedsnavn-API](https://api.kartverket.no/stedsnavn/v1/)                |

Stedsnavn-API-et har ikke søk på utsnitt, bare punktsøk med maks 5 km radius, så
utsnittet dekkes med et rutenett av punktsøk.

Skyggerelieffet og 3D-terrenget bruker de samme høydeflisene som analysen allerede har
lastet ned, så de koster ingen ekstra nedlasting.

## Kommandoer

| Kommando         | Beskrivelse                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `bun run dev`    | Utviklingsserver                                                    |
| `bun run build`  | Typesjekk og produksjonsbygg                                        |
| `bun test`       | Enhetstester                                                        |
| `bun run verify` | Kjører analysen mot ekte høydedata og sjekker mot Kartverkets fasit |
| `bun run lint`   | Oxlint                                                              |
| `bun run format` | Prettier                                                            |

`bun run verify` er integrasjonstesten: den laster ekte fliser, kjører hele kjeden og
kontrollerer at kjente fjell kommer ut med riktig navn og posisjon — og at ingen topp
bryter invariantene. Fasithøydene hentes fra Kartverkets høydetjeneste for det punktet
analysen faktisk fant, så testen måler datasettets nøyaktighet framfor å sammenligne
med tall noen har skrevet av.

To områder dekkes, fordi de stiller helt ulike krav:

```
bun run verify jotunheimen   # høyfjell: Galdhøpiggen, Glittertinden, Storen
bun run verify oslo          # lavland: Lathusåsen, Tryvannshøgda, Voksenåsen
```

Lavlandet er den strengeste prøven på navnematchingen. Toppene der er registrert som
«Ås», ikke «Fjell», og et søkepunkt i Oslo gir over 500 treff der fjellnavnene havner
på side to.

## Teknologi

React 19 + Vite 8 + TypeScript, MapLibre GL for kartet, CSS Modules for styling, Bun som
pakkebehandler og testkjører. Analysen ligger i en Web Worker med en diskriminert
meldingsunion mellom trådene.
