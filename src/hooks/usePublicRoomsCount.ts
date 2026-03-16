/**
 * Fetches and caches the count of public rooms for the Rooms tab badge.
 */
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { hasLiveblocksConfig } from "@/lib/liveblocks-client";

export function usePublicRoomsCount(): number {
  const [count, setCount] = useState(0);

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
  }, []);

  return count;
}
