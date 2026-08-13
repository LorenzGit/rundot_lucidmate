/** Design-unit layout helpers for the chess board scene. */

export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface BoardLayout {
    originX: number;
    originY: number;
    cell: number;
    size: number;
}

/** Shipped chrome constants — tests import these; do not re-derive. */
export const BOARD_FRAME_PAD = 10;
export const BOARD_TOP_RESERVE_EXTRA = 112;
export const BOARD_TOP_RESERVE_MIN = 148;
export const BOARD_BOTTOM_RESERVE_EXTRA = 108;
export const BOARD_BOTTOM_RESERVE_MIN = 136;
export const LANDSCAPE_RAIL_WIDTH = 400;
export const LANDSCAPE_RAIL_EDGE = 26;
export const LANDSCAPE_RAIL_GAP = 18;

export function topReserveFor(insets: Insets): number {
    return Math.max(insets.top + BOARD_TOP_RESERVE_EXTRA, BOARD_TOP_RESERVE_MIN);
}

export function bottomReserveFor(insets: Insets): number {
    return Math.max(insets.bottom + BOARD_BOTTOM_RESERVE_EXTRA, BOARD_BOTTOM_RESERVE_MIN);
}

/**
 * Fit an 8×8 board in the playable frame.
 *
 * Portrait is width-first. Landscape first removes the DOM control rail, then
 * centers the board in the remaining play column. It only shrinks if the
 * vertical space between the HUD and helper bar is tighter.
 */
export function computeBoardLayout(designWidth: number, designHeight: number, insets: Insets): BoardLayout {
    const topReserve = topReserveFor(insets);
    const bottomReserve = bottomReserveFor(insets);
    const sidePadL = insets.left + BOARD_FRAME_PAD;
    const sidePadR =
        designWidth > designHeight
            ? Math.max(insets.right, LANDSCAPE_RAIL_EDGE) + LANDSCAPE_RAIL_WIDTH + LANDSCAPE_RAIL_GAP
            : insets.right + BOARD_FRAME_PAD;
    const availableW = Math.max(200, designWidth - sidePadL - sidePadR);
    const availableH = Math.max(200, designHeight - topReserve - bottomReserve);
    const size = Math.min(availableW, availableH);
    const cell = size / 8;
    const originX = sidePadL + (availableW - size) / 2;
    const originY = topReserve + (availableH - size) / 2;
    return { originX, originY, cell, size };
}

export function squareToLocal(layout: BoardLayout, sq: number, flipped: boolean): { x: number; y: number } {
    const file = sq & 7;
    const rank = sq >> 3;
    const displayFile = flipped ? 7 - file : file;
    const displayRank = flipped ? rank : 7 - rank;
    return {
        x: layout.originX + (displayFile + 0.5) * layout.cell,
        y: layout.originY + (displayRank + 0.5) * layout.cell,
    };
}

export function localToSquare(layout: BoardLayout, x: number, y: number, flipped: boolean): number | null {
    const relX = x - layout.originX;
    const relY = y - layout.originY;
    if (relX < 0 || relY < 0 || relX >= layout.size || relY >= layout.size) return null;
    const displayFile = Math.floor(relX / layout.cell);
    const displayRank = Math.floor(relY / layout.cell);
    if (displayFile < 0 || displayFile > 7 || displayRank < 0 || displayRank > 7) return null;
    const file = flipped ? 7 - displayFile : displayFile;
    const rank = flipped ? displayRank : 7 - displayRank;
    return rank * 8 + file;
}
