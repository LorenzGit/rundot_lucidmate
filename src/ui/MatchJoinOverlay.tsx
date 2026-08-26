import { useStore } from "../state/store.ts";

export default function MatchJoinOverlay() {
    const label = useStore((state) => state.joinBusyLabel);
    if (!label) return null;
    return (
        <div
            className="match-join-overlay"
            role="status"
            aria-live="polite"
            aria-busy="true"
            data-testid="match-join-overlay"
        >
            <div className="match-join-card">
                <i className="match-join-spinner" aria-hidden="true" />
                <strong>{label}</strong>
            </div>
        </div>
    );
}
