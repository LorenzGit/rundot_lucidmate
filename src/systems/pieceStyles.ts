import { PLATFORM_IDS } from "../config/platform.ts";
import { DEFAULT_PIECE_STYLE, type PieceStyleId } from "../game/art/pieceStyles.ts";
import { store } from "../state/store.ts";
import { entitlementsReady, hasEntitlement, onOwnershipChanged } from "./commerce.ts";
import { saveSystem } from "./save.ts";

export function pieceStyleIsOwned(id: PieceStyleId): boolean {
    return id === DEFAULT_PIECE_STYLE || hasEntitlement(PLATFORM_IDS.piecePackEntitlement);
}

export function selectPieceStyle(id: PieceStyleId): boolean {
    if (!pieceStyleIsOwned(id)) return false;
    store.patch({ selectedPieceStyle: id });
    void saveSystem.flush();
    return true;
}

function enforceOwnedSelection(): void {
    if (!entitlementsReady() || pieceStyleIsOwned(store.get().selectedPieceStyle)) return;
    store.patch({ selectedPieceStyle: DEFAULT_PIECE_STYLE });
    void saveSystem.flush();
}

onOwnershipChanged(enforceOwnedSelection);
