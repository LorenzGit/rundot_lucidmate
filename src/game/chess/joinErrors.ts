export function isDuplicateSessionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /duplicate.?session|same (player|profile|account)|already connected|already in (this|the) room/i.test(
        message,
    );
}

export function describeRivalsError(error: unknown): string {
    if (isDuplicateSessionError(error)) {
        return "Your rival list is open in another RUN window. Close it there, then retry here.";
    }
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (/unauthori[sz]ed|forbidden|close(?:d)?\s*4001/i.test(message)) {
        return "RUN could not refresh rivals for this account. Reopen Lucidmate and try again.";
    }
    return "Rivals are taking longer than expected. Try again in a moment.";
}

export function describeJoinError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (/not found|room_not_found|no longer exists/i.test(message)) {
        return "Match code not found. Check all 6 characters or ask for a new code.";
    }
    if (/full|locked/i.test(message)) return "That match already has two players.";
    if (isDuplicateSessionError(error)) {
        return "You’re already connected to this board. To test both sides, join from a different RUN account.";
    }
    if (/unauthori[sz]ed|forbidden|close(?:d)?\s*4001/i.test(message)) {
        return "RUN couldn’t open this board for your account. Refresh RUN, then try again.";
    }
    return "We couldn’t reach that board. Try again in a moment.";
}

export function describeCorrespondenceError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (/belongs to two other players|not seated/i.test(message)) {
        return "This board belongs to another RUN account.";
    }
    if (/match has ended|game is not in progress/i.test(message)) {
        return "This match has ended. You can remove it from Your Games.";
    }
    if (isDuplicateSessionError(error)) {
        return "This board is already open on another device. Close it there, then try again.";
    }
    if (/unauthori[sz]ed|forbidden|close(?:d)?\s*4001/i.test(message)) {
        return "RUN could not open this board for your account. Refresh RUN, then try again.";
    }
    if (/timed out|board state/i.test(message)) {
        return "The board is taking too long to wake up. Try again in a moment.";
    }
    return "RUN could not reopen this board. Try again in a moment.";
}
