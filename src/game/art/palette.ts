/**
 * Board themes — pure cosmetics. Rules never read these.
 *
 * Contrast rules:
 * - Light squares stay mid-tone (never near white) so ivory pieces read.
 * - White pieces are cool pure ivory; black pieces use saturated colours.
 * - Outline is always near-black for piece silhouettes on any square.
 */

export type ThemeId = "midnight" | "nebula" | "mango" | "ultraviolet" | "lava" | "mintwave";

export interface TripTheme {
    id: ThemeId;
    name: string;
    blurb: string;
    dark: number;
    light: number;
    whitePiece: number;
    blackPiece: number;
    outline: number;
    stage: number;
    accent: number;
    accent2: number;
    /** Legal-move dots / last-move tint — must not match light or dark squares. */
    moveMark: number;
    /** Capture-target ring. */
    captureMark: number;
}

export const THEMES: readonly TripTheme[] = [
    {
        id: "midnight",
        name: "EMERALD CLUB",
        blurb: "Cream porcelain, emerald felt and warm gold.",
        dark: 0x21483e,
        light: 0xb8b39f,
        whitePiece: 0xfff8df,
        blackPiece: 0xe06f5c,
        outline: 0x10231f,
        stage: 0x0a211d,
        accent: 0xf2c453,
        accent2: 0x61d2b2,
        moveMark: 0xf5c84d,
        captureMark: 0xef755f,
    },
    {
        id: "nebula",
        name: "MOON CANDY",
        blurb: "Blueberry night, bubblegum pieces and lemon stars.",
        dark: 0x303655,
        light: 0xb8b8cf,
        whitePiece: 0xfff7df,
        blackPiece: 0xf06fa9,
        outline: 0x15162a,
        stage: 0x11162c,
        accent: 0x77cbea,
        accent2: 0xff8dbb,
        moveMark: 0xf9cd55,
        captureMark: 0xf06f72,
    },
    {
        id: "mango",
        name: "COZY CAFÉ",
        blurb: "Cocoa squares, peach treats and latte foam.",
        dark: 0x654739,
        light: 0xc6aa82,
        whitePiece: 0xfffdf6,
        blackPiece: 0xe06f51,
        outline: 0x180e08,
        stage: 0x16100c,
        accent: 0xe0a040,
        accent2: 0xd46a70,
        moveMark: 0x3a90c8,
        captureMark: 0xc84040,
    },
    {
        id: "ultraviolet",
        name: "STAR PAJAMAS",
        blurb: "Plum blankets, lilac moons and mint constellations.",
        dark: 0x352c50,
        light: 0x9e94b0,
        whitePiece: 0xfffcff,
        blackPiece: 0x8a58b8,
        outline: 0x0c0814,
        stage: 0x100e18,
        accent: 0xb08ad4,
        accent2: 0x70c0c8,
        moveMark: 0xf0b040,
        captureMark: 0xe06080,
    },
    {
        id: "lava",
        name: "SUNSET CIRCUS",
        blurb: "Coral tents, charcoal rings and golden applause.",
        dark: 0x50363d,
        light: 0xc9a38e,
        whitePiece: 0xfffaf4,
        blackPiece: 0xc04040,
        outline: 0x120808,
        stage: 0x140e0e,
        accent: 0xe08050,
        accent2: 0xe0b050,
        moveMark: 0x50a0d0,
        captureMark: 0xff6040,
    },
    {
        id: "mintwave",
        name: "ROYAL AQUARIUM",
        blurb: "Sea-glass squares, pearl pieces and lagoon lights.",
        dark: 0x24505a,
        light: 0x92bdb4,
        whitePiece: 0xf8fffc,
        blackPiece: 0xc05888,
        outline: 0x081210,
        stage: 0x0c1414,
        accent: 0x58b8a8,
        accent2: 0xd088a8,
        moveMark: 0xe0a040,
        captureMark: 0xd05060,
    },
];

export const DEFAULT_THEME: ThemeId = "midnight";

export function isThemeId(value: unknown): value is ThemeId {
    return typeof value === "string" && THEMES.some((t) => t.id === value);
}

export function getTheme(id: ThemeId): TripTheme {
    return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export const EARNABLE_THEMES: readonly ThemeId[] = ["midnight", "mango", "mintwave"];

export const THEME_AURA_COST: Readonly<Record<ThemeId, number>> = {
    midnight: 0,
    mango: 80,
    mintwave: 120,
    nebula: 0,
    ultraviolet: 0,
    lava: 0,
};
