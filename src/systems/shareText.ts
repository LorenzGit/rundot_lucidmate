/** Copy deliberately editable/shareable text without exposing browser chrome elsewhere. */
export async function copyPlainText(value: string): Promise<boolean> {
    const text = value.trim();
    if (!text) return false;

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Continue to the selection-based fallback below.
    }

    try {
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        document.body.appendChild(input);
        input.focus();
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        return copied;
    } catch {
        return false;
    }
}
