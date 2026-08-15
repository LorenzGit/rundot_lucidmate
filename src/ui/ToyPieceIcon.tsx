import type { PieceType } from "../game/chess/types.ts";

export default function ToyPieceIcon({ type = "p", className = "" }: { type?: PieceType; className?: string }) {
    const common = { fill: "currentColor", stroke: "currentColor", strokeLinejoin: "round" as const };
    return (
        <svg className={`toy-piece-icon ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true">
            <ellipse cx="32" cy="55" rx="22" ry="5" opacity="0.18" />
            {type === "p" && (
                <>
                    <circle cx="32" cy="20" r="10" {...common} />
                    <path d="M22 46c1-11 5-17 10-17s9 6 10 17Z" {...common} />
                </>
            )}
            {type === "n" && <path d="M18 47c2-11 5-19 13-24l-5-7 11 2c8 2 13 8 14 17l-13-2-4 14Z" {...common} />}
            {type === "b" && (
                <>
                    <path d="M32 10c9 7 12 14 7 23l-7 11-7-11c-5-9-2-16 7-23Z" {...common} />
                    <path d="m36 17-9 13" fill="none" stroke="var(--toy-piece-cut, #173c32)" strokeWidth="4" />
                </>
            )}
            {type === "r" && <path d="M17 13h8v7h6v-7h7v7h6v-7h4v13l-6 5 3 16H19l3-16-5-5Z" {...common} />}
            {type === "q" && (
                <>
                    <path d="m16 19 8 8 8-13 8 13 8-8-5 28H21Z" {...common} />
                    <circle cx="16" cy="17" r="4" {...common} />
                    <circle cx="32" cy="11" r="4" {...common} />
                    <circle cx="48" cy="17" r="4" {...common} />
                </>
            )}
            {type === "k" && (
                <>
                    <path d="M22 47c1-15 4-21 10-21s9 6 10 21Z" {...common} />
                    <path d="M32 8v18M24 16h16" fill="none" stroke="currentColor" strokeWidth="6" />
                </>
            )}
            <path d="M15 47h34l4 8H11Z" {...common} />
        </svg>
    );
}
