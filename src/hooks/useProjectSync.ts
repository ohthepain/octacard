/**
 * Subscribes to project, sample-edits, format-preset stores, debounced persist to project.
 */
import { useEffect, useRef } from "react";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { useProjectStore } from "@/stores/project-store";
import { useSampleEditsStore } from "@/stores/sample-edits-store";
import { useFormatPresetStore } from "@/stores/format-preset-store";

const DEBOUNCE_MS = 500;

export function useProjectSync(): void {
  const persistToProject = useCurrentProjectStore((s) => s.persistToProject);
  const projectId = useProjectStore((s) => s.id);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersist = () => {
    if (!projectId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persistToProject();
    }, DEBOUNCE_MS);
  };

  useEffect(() => {
    if (!projectId) return;

    const unsubProject = useProjectStore.subscribe(schedulePersist);
    const unsubEdits = useSampleEditsStore.subscribe(schedulePersist);
    const unsubFormat = useFormatPresetStore.subscribe(schedulePersist);

    return () => {
      unsubProject();
      unsubEdits();
      unsubFormat();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [projectId, persistToProject]);
}
