import type { TripTheme } from "../game/art/palette.ts";
import type { PieceStyleId } from "../game/art/pieceStyles.ts";
import ToyPieceIcon from "./ToyPieceIcon.tsx";

const PIECES = new Map([
    [1, { type: "n" as const, dark: true }],
    [3, { type: "q" as const, dark: true }],
    [4, { type: "p" as const, dark: true }],
    [6, { type: "p" as const, dark: true }],
    [9, { type: "p" as const, dark: false }],
    [11, { type: "p" as const, dark: false }],
    [12, { type: "r" as const, dark: false }],
    [14, { type: "k" as const, dark: false }],
]) as ReadonlyMap<number, { type: "p" | "n" | "q" | "r" | "k"; dark: boolean }>;

const PREVIEW_SQUARES = [
    "a4",
    "b4",
    "c4",
    "d4",
    "a3",
    "b3",
    "c3",
    "d3",
    "a2",
    "b2",
    "c2",
    "d2",
    "a1",
    "b1",
    "c1",
    "d1",
] as const;

function hex(value: number): string {
    return `#${value.toString(16).padStart(6, "0")}`;
}

export default function ThemeBoardPreview({
    theme,
    pieceStyle = "dream",
    compact = false,
}: {
    theme: TripTheme;
    pieceStyle?: PieceStyleId;
    compact?: boolean;
}) {
    return (
        <span
            className={`theme-board-preview${compact ? " compact" : ""}`}
            style={
                {
                    "--preview-dark": hex(theme.dark),
                    "--preview-light": hex(theme.light),
                    "--preview-white": pieceStyle === "candy" ? "#fff2cf" : hex(theme.whitePiece),
                    "--preview-black": pieceStyle === "candy" ? "#f0529a" : hex(theme.blackPiece),
                    "--preview-accent": pieceStyle === "candy" ? "#79ead6" : hex(theme.accent),
                } as React.CSSProperties
            }
            aria-hidden="true"
        >
            {PREVIEW_SQUARES.map((square, index) => {
                const piece = PIECES.get(index);
                return (
                    <i key={square} className={(Math.floor(index / 4) + index) % 2 ? "dark" : "light"}>
                        {piece && (
                            <ToyPieceIcon
                                type={piece.type}
                                className={`${piece.dark ? "dark-piece" : "light-piece"} ${pieceStyle}`}
                            />
                        )}
                    </i>
                );
            })}
        </span>
    );
}
