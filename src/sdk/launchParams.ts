import { isMatchKey, type CorrespondencePace } from "../social/model.ts";

/** SDK 5.24 recipe pushes wrap their routing fields in a JSON `payload` value. */
export function normalizeLaunchParams(params: Record<string, string>): Record<string, string> {
    if (typeof params.payload !== "string") return params;
    try {
        const parsed = JSON.parse(params.payload) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return params;
        const nested = Object.fromEntries(
            Object.entries(parsed)
                .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
                .map(([key, value]) => [key, String(value)]),
        );
        return { ...nested, ...params };
    } catch {
        return params;
    }
}

export function matchFromLaunchParams(params: Record<string, string>): {
    matchKey: string;
    pace: CorrespondencePace;
    roomCode: string | null;
} | null {
    const launched = normalizeLaunchParams(params);
    const matchKey = launched.matchKey;
    if (!isMatchKey(matchKey)) return null;
    const pace = launched.pace === "relaxed" ? "relaxed" : "daily";
    const roomCodeParam = launched.roomCode;
    const roomCode = typeof roomCodeParam === "string" && /^[A-Z0-9]{6}$/.test(roomCodeParam) ? roomCodeParam : null;
    return { matchKey, pace, roomCode };
}
