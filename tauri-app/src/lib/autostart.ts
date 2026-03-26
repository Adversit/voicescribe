import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

export async function getAutostartEnabled(): Promise<boolean> {
  try {
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await enable();
    return;
  }

  await disable();
}
