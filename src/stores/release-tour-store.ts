import { create } from "zustand";
import type { ReleaseNotes, ReleaseInstruction, ReleaseIndexEntry } from "@/lib/releaseNotes";
import { loadReleaseNotes, loadReleaseIndex, getTourSteps, getFeatures } from "@/lib/releaseNotes";

export type TourStep = {
  featureId: string;
  featureTitle: string;
  stepIndex: number;
  instruction: ReleaseInstruction;
};

export type DemoPaths = { sourcePath?: string; destPath?: string } | null;

function getDemoPathsForStep(notes: ReleaseNotes | null, steps: TourStep[], index: number): DemoPaths {
  if (!notes || index < 0 || index >= steps.length) return null;
  const step = steps[index];
  const feature = notes.features.find((f) => f.id === step.featureId);
  if (!feature?.demo?.sourcePath && !feature?.demo?.destPath) return null;
  return {
    sourcePath: feature.demo?.sourcePath,
    destPath: feature.demo?.destPath,
  };
}

function getFirstStepIndexForFeature(steps: TourStep[], featureId: string): number {
  const idx = steps.findIndex((s) => s.featureId === featureId);
  return idx >= 0 ? idx : 0;
}

interface ReleaseTourState {
  releases: ReleaseIndexEntry[];
  currentReleaseIndex: number;
  notes: ReleaseNotes | null;
  steps: TourStep[];
  currentFeatureIndex: number;
  showMeStepIndex: number | null;
  isActive: boolean;
  isLoading: boolean;
  error: string | null;
  requestedDemoPaths: DemoPaths;

  loadAndStart: () => Promise<boolean>;
  nextRelease: () => Promise<void>;
  prevRelease: () => Promise<void>;
  nextFeature: () => void;
  prevFeature: () => void;
  goToFeature: (index: number) => void;
  showMe: (stepIndex: number) => void;
  clearShowMe: () => void;
  skip: () => void;
  getCurrentDemoPaths: () => DemoPaths;
}

export const useReleaseTourStore = create<ReleaseTourState>((set, get) => ({
  releases: [],
  currentReleaseIndex: 0,
  notes: null,
  steps: [],
  currentFeatureIndex: 0,
  showMeStepIndex: null,
  isActive: false,
  isLoading: false,
  error: null,
  requestedDemoPaths: null,

  loadAndStart: async () => {
    set({ isLoading: true, error: null });
    const index = await loadReleaseIndex();
    if (!index || index.releases.length === 0) {
      set({ isLoading: false, error: "No releases found" });
      return false;
    }
    const notes = await loadReleaseNotes(index.releases[0].path);
    if (!notes) {
      set({ isLoading: false, error: "Failed to load release notes" });
      return false;
    }
    const steps = getTourSteps(notes);
    if (steps.length === 0) {
      set({ isLoading: false, error: "No features in release" });
      return false;
    }
    const firstStepIndex = getFirstStepIndexForFeature(steps, getFeatures(notes)[0].id);
    const requestedDemoPaths = getDemoPathsForStep(notes, steps, firstStepIndex);
    set({
      releases: index.releases,
      currentReleaseIndex: 0,
      notes,
      steps,
      currentFeatureIndex: 0,
      showMeStepIndex: null,
      isActive: true,
      isLoading: false,
      error: null,
      requestedDemoPaths,
    });
    return true;
  },

  nextRelease: async () => {
    const { releases, currentReleaseIndex } = get();
    if (currentReleaseIndex >= releases.length - 1) return;
    const nextIndex = currentReleaseIndex + 1;
    const notes = await loadReleaseNotes(releases[nextIndex].path);
    if (!notes) return;
    const steps = getTourSteps(notes);
    if (steps.length === 0) return;
    const firstStepIndex = getFirstStepIndexForFeature(steps, getFeatures(notes)[0].id);
    const requestedDemoPaths = getDemoPathsForStep(notes, steps, firstStepIndex);
    set({
      currentReleaseIndex: nextIndex,
      notes,
      steps,
      currentFeatureIndex: 0,
      showMeStepIndex: null,
      requestedDemoPaths,
    });
  },

  prevRelease: async () => {
    const { releases, currentReleaseIndex } = get();
    if (currentReleaseIndex <= 0) return;
    const prevIndex = currentReleaseIndex - 1;
    const notes = await loadReleaseNotes(releases[prevIndex].path);
    if (!notes) return;
    const steps = getTourSteps(notes);
    if (steps.length === 0) return;
    const firstStepIndex = getFirstStepIndexForFeature(steps, getFeatures(notes)[0].id);
    const requestedDemoPaths = getDemoPathsForStep(notes, steps, firstStepIndex);
    set({
      currentReleaseIndex: prevIndex,
      notes,
      steps,
      currentFeatureIndex: 0,
      showMeStepIndex: null,
      requestedDemoPaths,
    });
  },

  nextFeature: () => {
    const { notes, steps, currentFeatureIndex } = get();
    const features = getFeatures(notes!);
    if (currentFeatureIndex >= features.length - 1) return;
    const nextFeature = features[currentFeatureIndex + 1];
    const stepIndex = getFirstStepIndexForFeature(steps, nextFeature.id);
    const requestedDemoPaths = getDemoPathsForStep(notes, steps, stepIndex);
    set({
      currentFeatureIndex: currentFeatureIndex + 1,
      showMeStepIndex: null,
      requestedDemoPaths,
    });
  },

  prevFeature: () => {
    const { notes, steps, currentFeatureIndex } = get();
    if (currentFeatureIndex <= 0) return;
    const features = getFeatures(notes!);
    const prevFeature = features[currentFeatureIndex - 1];
    const stepIndex = getFirstStepIndexForFeature(steps, prevFeature.id);
    const requestedDemoPaths = getDemoPathsForStep(notes, steps, stepIndex);
    set({
      currentFeatureIndex: currentFeatureIndex - 1,
      showMeStepIndex: null,
      requestedDemoPaths,
    });
  },

  goToFeature: (index: number) => {
    const { notes, steps } = get();
    const features = getFeatures(notes!);
    if (index < 0 || index >= features.length) return;
    const feature = features[index];
    const stepIndex = getFirstStepIndexForFeature(steps, feature.id);
    const requestedDemoPaths = getDemoPathsForStep(notes, steps, stepIndex);
    set({
      currentFeatureIndex: index,
      showMeStepIndex: null,
      requestedDemoPaths,
    });
  },

  showMe: (stepIndex: number) => {
    const { showMeStepIndex } = get();
    set({ showMeStepIndex: showMeStepIndex === stepIndex ? null : stepIndex });
  },

  clearShowMe: () => set({ showMeStepIndex: null }),

  skip: () => {
    set({ isActive: false, requestedDemoPaths: null, showMeStepIndex: null });
  },

  getCurrentDemoPaths: () => {
    const { notes, steps, currentFeatureIndex } = get();
    const features = getFeatures(notes!);
    if (currentFeatureIndex >= features.length) return null;
    const feature = features[currentFeatureIndex];
    const stepIndex = getFirstStepIndexForFeature(steps, feature.id);
    return getDemoPathsForStep(notes, steps, stepIndex);
  },
}));
