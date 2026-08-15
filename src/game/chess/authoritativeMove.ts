import { fileOf, type Board, type Move, type PieceType } from "./types.ts";

interface AuthoritativeLastMove {
    from: number;
    to: number;
    promotion: PieceType | null;
}

/** Restore visual move details omitted by the multiplayer wire snapshot. */
export function moveFromAuthoritativeTransition(before: Board, after: Board, lastMove: AuthoritativeLastMove): Move {
    const movingPiece = before[lastMove.from];
    const landedPiece = after[lastMove.to];
    const capturedPiece = before[lastMove.to];
    const isPawnDiagonal = movingPiece?.type === "p" && fileOf(lastMove.from) !== fileOf(lastMove.to);
    const isEnPassant = isPawnDiagonal && capturedPiece === null;
    const isCastling = movingPiece?.type === "k" && Math.abs(lastMove.to - lastMove.from) === 2;

    return {
        from: lastMove.from,
        to: lastMove.to,
        piece: movingPiece?.type ?? (lastMove.promotion ? "p" : (landedPiece?.type ?? "p")),
        color: movingPiece?.color ?? landedPiece?.color ?? "w",
        capture: capturedPiece?.type ?? (isEnPassant ? "p" : null),
        promotion: lastMove.promotion,
        flags: isCastling ? (lastMove.to > lastMove.from ? "K" : "Q") : isEnPassant ? "e" : "",
    };
}
