/**
 * Puts text on the clipboard, including where the modern API is refused.
 *
 * A page opened from `file://`, which is how the local Configurator is reached
 * when it is not being served, is denied `navigator.clipboard` by the browser
 * rather than being told it is unavailable. The older command still works
 * there, and it needs a real element holding a real selection, so one is made,
 * used, and removed.
 *
 * @param source - The text to place on the clipboard.
 * @throws When neither route is permitted, so a caller can say so rather than
 *   reporting a copy that did not happen.
 */
export async function writeClipboard(source: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(source);
      return;
    } catch {
      // file:// pages may deny the modern Clipboard API; use the local fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = source;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("This browser blocked clipboard access.");
}
