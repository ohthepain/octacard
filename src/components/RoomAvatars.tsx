/**
 * Header presence row: user avatars when in a room.
 * Shows avatar, name, status dot, follow button, listen button.
 */
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, Headphones, MoreHorizontal } from "lucide-react";
import { useRoomStore } from "@/stores/room-store";
import { useFollowListenStore } from "@/stores/follow-listen-store";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface OtherUser {
  connectionId: number;
  id?: string;
  info?: { name?: string; avatar?: string };
  presence?: Record<string, unknown>;
}

export function RoomAvatars() {
  const { room } = useRoomStore();
  const { data: session } = useSession();
  const [others, setOthers] = useState<OtherUser[]>([]);
  const followingUserId = useFollowListenStore((s) => s.followingUserId);
  const listeningUserId = useFollowListenStore((s) => s.listeningUserId);
  const setFollowing = useFollowListenStore((s) => s.setFollowing);
  const setListening = useFollowListenStore((s) => s.setListening);

  useEffect(() => {
    if (!room) {
      setOthers([]);
      return;
    }

    const user = session?.user;
    if (user) {
      room.updatePresence({
        userId: user.id,
        name: user.name,
        avatar: user.image,
      });
    }

    const updateOthers = () => {
      const list = room.getOthers();
      setOthers(
        list.map((o) => {
          const presence = o.presence as Record<string, unknown> | undefined;
          const info = o.info as { name?: string; avatar?: string } | undefined;
          return {
            connectionId: o.connectionId,
            id: (o.id ?? presence?.userId) as string | undefined,
            info: {
              name: (info?.name ?? presence?.name) as string | undefined,
              avatar: (info?.avatar ?? presence?.avatar) as string | undefined,
            },
            presence,
          };
        }),
      );
    };

    updateOthers();
    const unsub = room.subscribe("others", updateOthers);
    return () => unsub();
  }, [room, session?.user]);

  if (!room || others.length === 0) return null;

  const myUserId = session?.user?.id;

  return (
    <div className="flex items-center gap-1">
      {others.map((other) => {
        const userId = other.id ?? `conn-${other.connectionId}`;
        const name = (other.info?.name as string) ?? "Anonymous";
        const avatar = other.info?.avatar as string | undefined;
        const initials = name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "?";
        const isFollowing = followingUserId === userId;
        const isListening = listeningUserId === userId;

        return (
          <DropdownMenu key={other.connectionId}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 border transition-colors",
                  "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label={`${name} - ${isFollowing ? "Following" : ""} ${isListening ? "Listening" : ""}`}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={avatar} alt={name} />
                  <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-xs truncate max-w-[60px]">{name}</span>
                <span
                  className="h-2 w-2 rounded-full bg-green-500 shrink-0"
                  title="Online"
                  aria-hidden
                />
                <MoreHorizontal className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => setFollowing(isFollowing ? null : userId)}
                disabled={myUserId === userId}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {isFollowing ? "Unfollow" : "Follow"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setListening(isListening ? null : userId)}
                disabled={myUserId === userId}
              >
                <Headphones className="w-4 h-4 mr-2" />
                {isListening ? "Stop listening" : "Listen"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
