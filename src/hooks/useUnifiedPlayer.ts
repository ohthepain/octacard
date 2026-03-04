/**
 * Hook that subscribes to player store and runs the unified playback engine.
 * Mount once at app level (e.g. in Index).
 */

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { startUnifiedPlayback, type PlaybackHandle } from "@/lib/unifiedPlayback";

export function useUnifiedPlayer() {
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const prevIsPlayingRef = useRef(false);
  const prevMultiStackRef = useRef<{ id: string; path: string }[]>([]);

  useEffect(() => {
    prevIsPlayingRef.current = usePlayerStore.getState().isPlaying;
    prevMultiStackRef.current = useMultiSampleStore.getState().stack.map((s) => ({ id: s.id, path: s.path }));

    const unsubMulti = useMultiSampleStore.subscribe(() => {
      const playerState = usePlayerStore.getState();
      if (!playerState.isPlaying || playerState.mode !== "multi") return;
      const multiStack = useMultiSampleStore.getState().stack;
      const hasValidBars = multiStack.some((s) => s.bars != null && s.bars > 0);
      if (multiStack.length === 0 || !hasValidBars) return;
      const prevStack = prevMultiStackRef.current;
      const currKeys = multiStack.map((s) => `${s.id}:${s.path}`).join(",");
      const prevKeys = prevStack.map((s) => `${s.id}:${s.path}`).join(",");
      if (currKeys === prevKeys) return;
      prevMultiStackRef.current = multiStack.map((s) => ({ id: s.id, path: s.path }));

      playbackRef.current?.stopSilent();
      playbackRef.current = null;
      usePlayerStore.setState({ stack: multiStack, activeSampleId: multiStack[0]?.id ?? null });
      const { volume, playbackRate } = playerState;
      const globalTempoBpm = useMultiSampleStore.getState().globalTempoBpm;
      const setPlayingSamplePosition = useMultiSampleStore.getState().setPlayingSamplePosition;
      const setPlayingSamplePositions = useMultiSampleStore.getState().setPlayingSamplePositions;
      const samples = multiStack.map((s) => ({
        id: s.id,
        path: s.path,
        paneType: s.paneType,
        bpm: s.bpm,
        duration: s.duration,
      }));
      startUnifiedPlayback("multi", samples, {
        volume,
        playbackRate: 1,
        globalTempoBpm,
        onTimeUpdate: (sampleId, t) => {
          usePlayerStore.getState().setCurrentTime(t);
          if (useWaveformEditorStore.getState().multiSampleId === sampleId) {
            setPlayingSamplePosition({ sampleId, currentTime: t });
          }
        },
        onPositionsUpdate: (positions) => setPlayingSamplePositions(positions),
        onEnded: () => {
          playbackRef.current = null;
          setPlayingSamplePosition(null);
          setPlayingSamplePositions({});
        },
      })
        .then((h) => { playbackRef.current = h; })
        .catch((err) => {
          console.warn("Multi stack-change restart failed:", err);
          usePlayerStore.getState().stop();
          setPlayingSamplePosition(null);
          setPlayingSamplePositions({});
        });
    });

    const unsub = usePlayerStore.subscribe((state) => {
      const prevPlaying = prevIsPlayingRef.current;
      prevIsPlayingRef.current = state.isPlaying;

      // Handle restart with new loop length (Ableton-style loop sync)
      if (state.restartRequest && playbackRef.current) {
        const handle = playbackRef.current;
        const req = state.restartRequest;
        const overridePlayStart = handle.getRestartPosition(req.path, req.newLoopStart, req.newLoopEnd);
        usePlayerStore.getState().clearRestartRequest();
        if (overridePlayStart != null) {
          handle.stopSilent();
          playbackRef.current = null;
          const { mode, singleFile, stack, volume, playbackRate } = state;
          const globalTempoBpm = useMultiSampleStore.getState().globalTempoBpm;
          const setPlayingSamplePosition = useMultiSampleStore.getState().setPlayingSamplePosition;
          if (mode === "single" && singleFile && singleFile.path === req.path) {
            startUnifiedPlayback("single", [{ id: singleFile.path, path: singleFile.path, paneType: singleFile.paneType }], {
              volume,
              playbackRate,
              globalTempoBpm,
              overridePlayStart: { [req.path]: overridePlayStart },
              onTimeUpdate: (_, t) => usePlayerStore.getState().setCurrentTime(t),
              onEnded: () => { playbackRef.current = null; },
            }).then((h) => { playbackRef.current = h; }).catch((err) => {
              console.warn("Restart failed:", err);
              usePlayerStore.getState().stop();
            });
          } else if (mode === "multi" && stack.length > 0) {
            const sample = stack.find((s) => s.path === req.path);
            if (sample) {
              const setPlayingSamplePositions = useMultiSampleStore.getState().setPlayingSamplePositions;
              const samples = stack.map((s) => ({ id: s.id, path: s.path, paneType: s.paneType, bpm: s.bpm, duration: s.duration }));
              startUnifiedPlayback("multi", samples, {
                volume,
                playbackRate: 1,
                globalTempoBpm,
                overridePlayStart: { [req.path]: overridePlayStart },
                onTimeUpdate: (sampleId, t) => {
                  usePlayerStore.getState().setCurrentTime(t);
                  if (useWaveformEditorStore.getState().multiSampleId === sampleId) {
                    setPlayingSamplePosition({ sampleId, currentTime: t });
                  }
                },
                onPositionsUpdate: (positions) => setPlayingSamplePositions(positions),
                onEnded: () => {
                  playbackRef.current = null;
                  setPlayingSamplePosition(null);
                  setPlayingSamplePositions({});
                },
              }).then((h) => { playbackRef.current = h; }).catch((err) => {
                console.warn("Multi restart failed:", err);
                usePlayerStore.getState().stop();
                setPlayingSamplePosition(null);
                useMultiSampleStore.getState().setPlayingSamplePositions({});
              });
            }
          }
        }
        return;
      }

      if (!state.isPlaying && prevPlaying) {
        playbackRef.current?.stopSilent();
        playbackRef.current = null;
        return;
      }
      if (state.switchAtBarRequest && playbackRef.current && state.isPlaying && state.mode === "single") {
        const req = state.switchAtBarRequest;
        usePlayerStore.getState().clearSwitchAtBarRequest();
        playbackRef.current
          .scheduleSwitchAtNextBar(req.path, req.paneType)
          .catch((err) => {
            console.warn("Switch at bar failed:", err);
            usePlayerStore.getState().stop();
          });
        return;
      }
      if (state.isPlaying && !prevPlaying) {
        const { mode, singleFile, stack, volume, playbackRate } = state;
        const globalTempoBpm = useMultiSampleStore.getState().globalTempoBpm;
        const setPlayingSamplePosition = useMultiSampleStore.getState().setPlayingSamplePosition;

        if (mode === "single" && singleFile) {
          startUnifiedPlayback("single", [{ id: singleFile.path, path: singleFile.path, paneType: singleFile.paneType }], {
            volume,
            playbackRate,
            globalTempoBpm,
            onTimeUpdate: (_, t) => {
              usePlayerStore.getState().setCurrentTime(t);
            },
            onEnded: () => {
              playbackRef.current = null;
            },
          })
            .then((handle) => {
              playbackRef.current = handle;
            })
            .catch((err) => {
              console.warn("Unified playback failed:", err);
              usePlayerStore.getState().stop();
            });
        } else if (mode === "multi" && stack.length > 0) {
          const setPlayingSamplePositions = useMultiSampleStore.getState().setPlayingSamplePositions;
          const samples = stack.map((s) => ({
            id: s.id,
            path: s.path,
            paneType: s.paneType,
            bpm: s.bpm,
            duration: s.duration,
          }));
          startUnifiedPlayback("multi", samples, {
            volume,
            playbackRate: 1,
            globalTempoBpm,
            onTimeUpdate: (sampleId, t) => {
              usePlayerStore.getState().setCurrentTime(t);
              const multiSampleId = useWaveformEditorStore.getState().multiSampleId;
              if (multiSampleId === sampleId) {
                setPlayingSamplePosition({ sampleId, currentTime: t });
              }
            },
            onPositionsUpdate: (positions) => {
              setPlayingSamplePositions(positions);
            },
            onEnded: () => {
              playbackRef.current = null;
              setPlayingSamplePosition(null);
              setPlayingSamplePositions({});
            },
          })
            .then((handle) => {
              playbackRef.current = handle;
            })
            .catch((err) => {
              console.warn("Unified multi playback failed:", err);
              usePlayerStore.getState().stop();
              setPlayingSamplePosition(null);
              useMultiSampleStore.getState().setPlayingSamplePositions({});
            });
        }
      }
    });

    return () => {
      unsub();
      unsubMulti();
      playbackRef.current?.stop();
      playbackRef.current = null;
    };
  }, []);
}
