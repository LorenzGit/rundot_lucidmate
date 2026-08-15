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
