import { store } from "../state/store.ts";

const LOCALE_TAGS: Readonly<Record<string, string>> = {
    English: "en-US",
    PortugueseBR: "pt-BR",
    SpanishLA: "es-419",
};

export function formatNumber(value: number): string {
    const locale = LOCALE_TAGS[store.get().locale] ?? "en-US";
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}
