/** Cosmetic piece silhouettes/colors. Chess rules never read these values. */
export type PieceStyleId = "dream" | "candy";

export interface PieceStyle {
    id: PieceStyleId;
    name: string;
    blurb: string;
}

export const PIECE_STYLES: readonly PieceStyle[] = [
    { id: "dream", name: "DREAM CHROME", blurb: "The original ivory and neon tournament set." },
    { id: "candy", name: "CANDY CLUB", blurb: "Bubblegum pink, mint jewels and glossy striped bases." },
];

export const DEFAULT_PIECE_STYLE: PieceStyleId = "dream";

export function isPieceStyleId(value: unknown): value is PieceStyleId {
    return typeof value === "string" && PIECE_STYLES.some((style) => style.id === value);
}
