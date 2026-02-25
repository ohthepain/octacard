import { useAppOptionsStore } from "@/stores/app-options-store";

export function BuildHashBadge() {
  const devMode = useAppOptionsStore((s) => s.devMode);

  if (!devMode) return null;

  const shaShort = typeof __GIT_SHA_SHORT__ === "string" ? __GIT_SHA_SHORT__ : "unknown";
  const shaFull = typeof __GIT_SHA__ === "string" ? __GIT_SHA__ : "unknown";

  return (
    <div className="fixed bottom-2 right-2 z-50 select-none">
      <div
        className="rounded border border-border bg-card/90 px-2 py-1 text-[11px] font-mono text-muted-foreground shadow-sm backdrop-blur"
        title={`git: ${shaFull}`}
      >
        {shaShort}
      </div>
    </div>
  );
}

