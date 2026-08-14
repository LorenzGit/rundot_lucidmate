/**
 * Shared multiplayer protocol for LUCIDMATE chess.
 * Used by the GameRoom server and the client — keep pure (no DOM).
 *
 * Never name a payload field `type` that collides with non-discriminators;
 * here `type` is only the protocol discriminant (SDK convention).
 */
import type { CastlingRights, Color, GameStatus, Piece, PieceType } from "./types.ts";
import type { ChessReaction, CorrespondencePace, RivalIdentity } from "../../social/model.ts";

export const CHESS_ROOM_TYPE = "lucidmate-chess";
export const CORRESPONDENCE_ROOM_TYPE = "lucidmate-correspondence";

export type WirePiece = { c: Color; t: PieceType };
export type WireBoard = Array<WirePiece | null>;

/** Client → server intents */
export type ChessClientMessage =
    | { type: "move"; from: number; to: number; promotion?: PieceType | null }
    | { type: "resign" }
    | { type: "ready" }
    | {
          type: "configure";
          matchKey: string;
          pace: CorrespondencePace;
          challenger?: RivalIdentity;
          recipient?: RivalIdentity;
      }
    | { type: "react"; reaction: ChessReaction }
    | { type: "rematch"; matchKey: string };

/** Server → client authoritative updates */
export type ChessServerMessage =
    | {
          type: "state";
          board: WireBoard;
          turn: Color;
          castling: CastlingRights;
          ep: number | null;
          status: GameStatus;
          phase: "waiting" | "playing" | "over";
          seats: { w: string | null; b: string | null };
          seatColors: Record<string, Color>;
          you: string | null;
          lastMove: { from: number; to: number; promotion: PieceType | null } | null;
          winner: Color | null;
          reason: string | null;
          roomCode: string | null;
          experience: "live" | "async";
          matchKey: string | null;
          pace: CorrespondencePace | null;
          players: { w: RivalIdentity | null; b: RivalIdentity | null };
          deadlineAt: number | null;
          updatedAt: number;
          moveCount: number;
          captureCount: number;
          checkCount: number;
          reaction: { id: ChessReaction; from: string; at: number; moveCount: number } | null;
          rematch: { matchKey: string; offeredBy: string } | null;
      }
    | { type: "error"; reason: string }
    | { type: "info"; message: string };

export type ChessProtocol = ChessClientMessage | ChessServerMessage;

export function pieceToWire(p: Piece | null): WirePiece | null {
    return p ? { c: p.color, t: p.type } : null;
}

export function wireToPiece(p: WirePiece | null): Piece | null {
    return p ? { color: p.c, type: p.t } : null;
}

export function boardToWire(board: Array<Piece | null>): WireBoard {
    return board.map(pieceToWire);
}

export function wireToBoard(board: WireBoard): Array<Piece | null> {
    return board.map(wireToPiece);
}
