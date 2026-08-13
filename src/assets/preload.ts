/**
 * Boot warming. Primes theme CSS tokens for menu chrome.
 */
import { getTheme, DEFAULT_THEME, isThemeId } from "../game/art/palette.ts";
import { store } from "../state/store.ts";

export async function warmAssets(onProgress: (p: number) => void): Promise<void> {
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
        onProgress(i / steps);
        await new Promise((r) => setTimeout(r, 12));
    }
    applyMenuBackdrop();
}

export function applyMenuBackdrop(themeIdInput: string = store.get().selectedTheme): void {
    const themeId = isThemeId(themeIdInput) ? themeIdInput : DEFAULT_THEME;
    const theme = getTheme(themeId);
    const root = document.documentElement;
    root.dataset.backdrop = themeId;
    root.style.setProperty("--stage", `#${theme.stage.toString(16).padStart(6, "0")}`);
    root.style.setProperty("--accent", `#${theme.accent.toString(16).padStart(6, "0")}`);
    root.style.setProperty("--accent-2", `#${theme.accent2.toString(16).padStart(6, "0")}`);
    root.style.setProperty("--dark-sq", `#${theme.dark.toString(16).padStart(6, "0")}`);
    root.style.setProperty("--light-sq", `#${theme.light.toString(16).padStart(6, "0")}`);
    root.style.removeProperty("--fractal-bg");
}
