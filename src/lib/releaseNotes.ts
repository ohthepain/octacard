/**
 * Types and utilities for Release Mode (guided demo engine).
 * Consumes structured JSON from schema/release-notes.schema.json.
 */

export interface ReleaseInstruction {
  text: string;
  highlight?: string;
  action?: "wait" | "click" | "navigate";
  waitFor?: string;
}

export interface ReleaseDemo {
  loadSample?: string;
  loadProjectState?: string;
  sourcePath?: string;
  destPath?: string;
}

export interface ReleaseFeature {
  id: string;
  title: string;
  include?: boolean;
  type?: "feature" | "fix" | "improvement";
  demo?: ReleaseDemo;
  instructions?: ReleaseInstruction[];
}

export interface ReleaseNotes {
  version: string;
  releaseDate: string;
  gitHash?: string;
  features: ReleaseFeature[];
}

/**
 * Load release notes JSON. In production, fetch from public/release-notes/.
 * For now, returns null if not found.
 */
export async function loadReleaseNotes(path: string): Promise<ReleaseNotes | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const data = (await res.json()) as ReleaseNotes;
    if (!data.version || !data.releaseDate || !Array.isArray(data.features)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Get included features with their instructions flattened into steps.
 * Each step has { featureId, featureTitle, stepIndex, instruction }.
 */
export function getTourSteps(notes: ReleaseNotes): Array<{
  featureId: string;
  featureTitle: string;
  stepIndex: number;
  instruction: ReleaseInstruction;
}> {
  const steps: Array<{
    featureId: string;
    featureTitle: string;
    stepIndex: number;
    instruction: ReleaseInstruction;
  }> = [];
  for (const f of notes.features) {
    if (f.include === false) continue;
    const instructions = f.instructions ?? [];
    for (let i = 0; i < instructions.length; i++) {
      steps.push({
        featureId: f.id,
        featureTitle: f.title,
        stepIndex: i,
        instruction: instructions[i],
      });
    }
  }
  return steps;
}
