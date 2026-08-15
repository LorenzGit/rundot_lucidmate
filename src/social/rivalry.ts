const RIVALRY_THRESHOLDS = [0, 2, 5, 10, 18] as const;
const RIVALRY_NAMES = ["New faces", "Chess pals", "Friendly rivals", "Dream duo", "Legendary pair"] as const;

export interface RivalryLevel {
    level: number;
    name: string;
    progress: number;
    next: number | null;
}

export function rivalryLevel(games: number): RivalryLevel {
    let index = 0;
    for (let step = 1; step < RIVALRY_THRESHOLDS.length; step++) {
        if (games < RIVALRY_THRESHOLDS[step]!) break;
        index = step;
    }

    const current = RIVALRY_THRESHOLDS[index]!;
    const next = RIVALRY_THRESHOLDS[index + 1] ?? null;
    return {
        level: index + 1,
        name: RIVALRY_NAMES[index]!,
        progress: next == null ? 1 : Math.min(1, (games - current) / (next - current)),
        next,
    };
}
