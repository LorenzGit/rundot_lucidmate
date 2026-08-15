import type { PieceType } from "../chess/types.ts";

export const CAPTURE_SHAKE_MAGNITUDE = 5;

/** Ordinary moves land cleanly; only taking a piece shakes the board. */
export function moveShakeMagnitude(capture: PieceType | null): number {
    return capture === null ? 0 : CAPTURE_SHAKE_MAGNITUDE;
}
