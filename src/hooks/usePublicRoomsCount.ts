/**
 * Fetches and caches the count of public rooms for the Rooms tab badge.
 * Refetches when roomsRefreshVersion changes (e.g. after going live or leaving).
 */
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { hasLiveblocksConfig } from "@/lib/liveblocks-client";
import { useRoomsRefreshStore } from "@/stores/rooms-refresh-store";

export function usePublicRoomsCount(): number {
  const [count, setCount] = useState(0);
  const refreshVersion = useRoomsRefreshStore((s) => s.version);

  useEffect(() => {
    if (!hasLiveblocksConfig()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/api/rooms/public");
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { rooms?: unknown[] };
        setCount(Array.isArray(data.rooms) ? data.rooms.length : 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshVersion]);

  return count;
}
