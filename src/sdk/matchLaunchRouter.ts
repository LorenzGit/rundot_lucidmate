import { matchFromLaunchParams, type MatchLaunch } from "./launchParams.ts";

/** Retain taps during boot and serialize room joins. The newest waiting tap wins. */
export function createMatchLaunchRouter(deps: {
    resolve: () => Promise<MatchLaunch | null>;
    open: (match: MatchLaunch) => Promise<boolean>;
    waitUntilIdle: () => Promise<void>;
    onError: (error: unknown) => void;
}) {
    let ready = false;
    let pending: MatchLaunch | null = null;
    let draining: Promise<boolean> | null = null;

    function drain(): Promise<boolean> {
        if (draining) return draining;
        draining = (async () => {
            let opened = false;
            try {
                while (pending) {
                    await deps.waitUntilIdle();
                    const match = pending;
                    pending = null;
                    try {
                        opened = (await deps.open(match)) || opened;
                    } catch (error) {
                        deps.onError(error);
                    }
                }
                return opened;
            } finally {
                draining = null;
            }
        })();
        return draining;
    }

    return {
        async receive(params: Record<string, string>): Promise<boolean> {
            const match = matchFromLaunchParams(params);
            if (!match) return false;
            pending = match;
            return ready ? drain() : false;
        },
        async start(): Promise<boolean> {
            const initial = await deps.resolve();
            pending ??= initial;
            ready = true;
            return pending ? drain() : false;
        },
    };
}
