export interface MasteryStats {
    matchesPlayed: number;
    wins: number;
    capturesLifetime: number;
    bestWinStreak: number;
}

interface DreamRank {
    name: string;
    threshold: number;
    reward: number;
}

const DREAM_RANKS: readonly DreamRank[] = [
    { name: "WANDERER", threshold: 0, reward: 0 },
    { name: "SEER", threshold: 100, reward: 25 },
    { name: "VOYAGER", threshold: 260, reward: 40 },
    { name: "LUCID", threshold: 520, reward: 55 },
    { name: "ONEIRONAUT", threshold: 880, reward: 75 },
    { name: "ASCENDANT", threshold: 1_350, reward: 100 },
] as const;

export interface DreamMastery {
    points: number;
    rankIndex: number;
    rankName: string;
    nextRankName: string | null;
    nextThreshold: number | null;
    nextReward: number;
    progress: number;
    remaining: number;
}

export function masteryPoints(stats: MasteryStats): number {
    return stats.matchesPlayed * 18 + stats.wins * 22 + stats.capturesLifetime * 2 + stats.bestWinStreak * 5;
}

export function dreamMastery(stats: MasteryStats): DreamMastery {
    const points = masteryPoints(stats);
    let rankIndex = 0;
    for (let index = 1; index < DREAM_RANKS.length; index++) {
        if (points < DREAM_RANKS[index]!.threshold) break;
        rankIndex = index;
    }

    const rank = DREAM_RANKS[rankIndex]!;
    const next = DREAM_RANKS[rankIndex + 1] ?? null;
    const span = next ? next.threshold - rank.threshold : 1;
    return {
        points,
        rankIndex,
        rankName: rank.name,
        nextRankName: next?.name ?? null,
        nextThreshold: next?.threshold ?? null,
        nextReward: next?.reward ?? 0,
        progress: next ? Math.max(0, Math.min(1, (points - rank.threshold) / span)) : 1,
        remaining: next ? Math.max(0, next.threshold - points) : 0,
    };
}

export function masteryRewardsBetween(fromRankIndex: number, toRankIndex: number): number {
    let reward = 0;
    for (let index = fromRankIndex + 1; index <= toRankIndex; index++) {
        reward += DREAM_RANKS[index]?.reward ?? 0;
    }
    return reward;
}
