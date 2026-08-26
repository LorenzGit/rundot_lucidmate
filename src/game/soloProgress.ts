type SoloPersister = { persistSoloProgress: () => void };

let persister: SoloPersister | null = null;

export function setSoloPersister(next: SoloPersister | null): void {
    persister = next;
}

export function captureSoloBoardIfNeeded(): void {
    persister?.persistSoloProgress();
}
