const STORAGE_KEY = "octacard_current_pack";

export interface CurrentPack {
  name: string;
}

export function getCurrentPack(): CurrentPack | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CurrentPack;
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

export function setCurrentPack(pack: CurrentPack | null): void {
  if (typeof window === "undefined") return;
  try {
    if (pack) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pack));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to save current pack:", error);
  }
}
