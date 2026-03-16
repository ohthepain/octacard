/**
 * Liveblocks client for collaborative rooms.
 */
import { createClient } from "@liveblocks/client";

const publicKey = import.meta.env.VITE_LIVEBLOCKS_PUBLIC_KEY as string | undefined;

export const liveblocksClient = createClient({
  publicApiKey: publicKey ?? "pk_placeholder",
});

export function hasLiveblocksConfig(): boolean {
  return Boolean(publicKey && publicKey !== "pk_placeholder");
}
