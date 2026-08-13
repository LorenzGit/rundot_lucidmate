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
        name: "MIDNIGHT",
        blurb: "Soft slate board, warm lights, gold markers.",
        dark: 0x3a3348,
        // Mid warm-gray — deliberately not cream so ivory pieces stay distinct.
        light: 0xa89f90,
        whitePiece: 0xfffef9,
        blackPiece: 0xb04a88,
        outline: 0x0c0a10,
        stage: 0x12101a,
        accent: 0xd4a84b,
        accent2: 0xc47a9e,
        moveMark: 0x2a9fd8,
        captureMark: 0xe85d4c,
    },
    {
        id: "nebula",
        name: "NEBULA",
        blurb: "Cool indigo board with sky-blue lights.",
        dark: 0x283050,
        light: 0x8f9ab4,
        whitePiece: 0xffffff,
        blackPiece: 0x3a8eb8,
        outline: 0x0a0e18,
        stage: 0x0e121c,
        accent: 0x6a9fd4,
        accent2: 0xc08ad4,
        moveMark: 0xffb84a,
        captureMark: 0xe85d6a,
    },
    {
        id: "mango",
        name: "MANGO",
        blurb: "Warm terracotta and sand.",
        dark: 0x5e3a2c,
        light: 0xb8a484,
        whitePiece: 0xfffdf6,
        blackPiece: 0xc45a30,
        outline: 0x180e08,
        stage: 0x16100c,
        accent: 0xe0a040,
        accent2: 0xd46a70,
        moveMark: 0x3a90c8,
        captureMark: 0xc84040,
    },
    {
        id: "ultraviolet",
        name: "TWILIGHT",
        blurb: "Muted plum and lilac.",
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
        name: "EMBER",
        blurb: "Charcoal and warm ash.",
        dark: 0x443030,
        light: 0xb09a8c,
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
        name: "MIST",
        blurb: "Sea-glass and fog.",
        dark: 0x284048,
        light: 0x8fb0a8,
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
