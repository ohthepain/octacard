/**
 * Sync presence: broadcast transport when in room, apply listened user's transport.
 */
import { useEffect } from "react";
import { useRoomStore } from "@/stores/room-store";
import { usePlayerStore } from "@/stores/player-store";
import { useProjectStore } from "@/stores/project-store";

export function usePresenceSync(listeningUserId: string | null) {
  const { room } = useRoomStore();

  useEffect(() => {
    if (!room) return;

    const broadcastTransport = () => {
      const { isPlaying, currentTime, mode, singleFile, stack, globalTempoBpm } = usePlayerStore.getState();
      room.updatePresence((prev) => ({
        ...prev,
        transport: {
          isPlaying,
          currentTime,
          mode,
          singleFile,
          stack: stack.map((s) => ({ path: s.path, paneType: s.paneType })),
          globalTempoBpm,
        },
      }));
    };

    broadcastTransport();
    const unsub = usePlayerStore.subscribe(broadcastTransport);
    return () => unsub();
  }, [room]);

  useEffect(() => {
    if (!room || !listeningUserId) return;

    const unsub = room.subscribe("others", () => {
      const others = room.getOthers();
      const target = others.find(
        (o) => (o.id ?? (o.presence as Record<string, unknown>)?.userId) === listeningUserId,
      );
      if (!target) return;

      const transport = (target.presence as Record<string, unknown>)?.transport as
        | {
            isPlaying?: boolean;
            currentTime?: number;
            globalTempoBpm?: number;
          }
        | undefined;
      if (!transport) return;

      const { stop, setCurrentTime, setGlobalTempoBpm } = usePlayerStore.getState();
      if (transport.isPlaying === false) {
        stop();
      }
      if (typeof transport.currentTime === "number") {
        setCurrentTime(transport.currentTime);
      }
      if (typeof transport.globalTempoBpm === "number") {
        setGlobalTempoBpm(transport.globalTempoBpm);
        useProjectStore.getState().setGlobalTempoBpm(transport.globalTempoBpm);
      }
    });

    return () => unsub();
  }, [room, listeningUserId]);
}
