/** Tallformatering for grensesnittet. Norsk konvensjon: komma og tynt mellomrom. */

const metres = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const kilometres = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 });

export const formatElevation = (metresAboveSea: number) =>
    `${metres.format(Math.round(metresAboveSea))} moh.`;

export const formatMetres = (value: number) => `${metres.format(Math.round(value))} m`;

/** Isolasjon oppgis i kilometer så snart tallet blir uhåndterlig i meter. */
export const formatDistance = (value: number) => {
    if (value < 0) return "ukjent";
    if (value < 1000) return `${metres.format(Math.round(value))} m`;
    return `${kilometres.format(value / 1000)} km`;
};

export const formatDuration = (milliseconds: number) => {
    const seconds = milliseconds / 1000;
    return seconds < 10 ? `${kilometres.format(seconds)} s` : `${Math.round(seconds)} s`;
};

export const formatCount = (count: number, singular: string, plural: string) =>
    `${metres.format(count)} ${count === 1 ? singular : plural}`;
