import { create } from "zustand";

export type NavigateRequest =
  | { type: "pack"; packId: string }
  | { type: "folder"; path: string; paneType: "source" | "dest" }
  | null;

interface NavigateRequestState {
  pendingRequest: NavigateRequest;
  requestNavigate: (req: NavigateRequest) => void;
  clearRequest: () => void;
}

export const useNavigateRequestStore = create<NavigateRequestState>((set) => ({
  pendingRequest: null,
  requestNavigate: (req) => set({ pendingRequest: req }),
  clearRequest: () => set({ pendingRequest: null }),
}));
