import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyText(text: string): Promise<void> {
  if (!text) {
    return;
  }

  try {
    await writeText(text);
    return;
  } catch {
    // Fall back for browser-only dev mode.
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error("????????");
}
