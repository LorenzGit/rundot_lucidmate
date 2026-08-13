import { type Board, type CastlingRights, type Color, type Piece, type PieceType, square } from "./types.ts";

export function emptyBoard(): Board {
    return Array.from({ length: 64 }, () => null);
}

export function cloneBoard(board: Board): Board {
    return board.map((p) => (p ? { color: p.color, type: p.type } : null));
}

export function startingBoard(): Board {
    const board = emptyBoard();
    const back: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
    for (let file = 0; file < 8; file++) {
        board[square(file, 0)] = { color: "w", type: back[file]! };
        board[square(file, 1)] = { color: "w", type: "p" };
        board[square(file, 6)] = { color: "b", type: "p" };
        board[square(file, 7)] = { color: "b", type: back[file]! };
    }
    return board;
}

export function fullCastling(): CastlingRights {
    return { wK: true, wQ: true, bK: true, bQ: true };
}

export function cloneCastling(c: CastlingRights): CastlingRights {
    return { wK: c.wK, wQ: c.wQ, bK: c.bK, bQ: c.bQ };
}

export function findKing(board: Board, color: Color): number {
    for (let i = 0; i < 64; i++) {
        const p = board[i];
        if (p && p.color === color && p.type === "k") return i;
    }
    return -1;
}

export function pieceAt(board: Board, sq: number): Piece | null {
    return board[sq] ?? null;
}
