/**
 * Trigger for refreshing the public rooms list (e.g. after going live or leaving).
 */
import { create } from "zustand";

interface RoomsRefreshState {
  version: number;
  triggerRefresh: () => void;
}

export const useRoomsRefreshStore = create<RoomsRefreshState>((set) => ({
  version: 0,
  triggerRefresh: () => set((s) => ({ version: s.version + 1 })),
}));
