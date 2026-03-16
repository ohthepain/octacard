/**
 * Follow/Listen state for room collaboration.
 */
import { create } from "zustand";

interface FollowListenState {
  followingUserId: string | null;
  listeningUserId: string | null;
  setFollowing: (userId: string | null) => void;
  setListening: (userId: string | null) => void;
}

export const useFollowListenStore = create<FollowListenState>((set) => ({
  followingUserId: null,
  listeningUserId: null,
  setFollowing: (userId) => set({ followingUserId: userId }),
  setListening: (userId) => set({ listeningUserId: userId }),
}));
