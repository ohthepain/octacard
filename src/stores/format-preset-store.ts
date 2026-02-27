import { create } from "zustand";

export interface FormatSettings {
  fileFormat: "dont-change" | "WAV";
  sampleRate: "dont-change" | "31250" | "44100" | "48000";
  sampleDepth: "dont-change" | "16-bit";
  pitch: "dont-change" | "C";
  mono: boolean;
  normalize: boolean;
  trim: boolean;
  tempo: string;
}

export interface FormatPreset {
  id: string;
  name: string;
  settings: FormatSettings;
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  fileFormat: "dont-change",
  sampleRate: "dont-change",
  sampleDepth: "dont-change",
  pitch: "dont-change",
  mono: false,
  normalize: false,
  trim: false,
  tempo: "dont-change",
};

export const DEVICE_PRESETS: FormatPreset[] = [
  {
    id: "octatrack",
    name: "Octatrack",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "44100",
      sampleDepth: "16-bit",
    },
  },
  {
    id: "digitakt",
    name: "Digitakt",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "48000",
    },
  },
  {
    id: "digitakt-v1",
    name: "Digitakt v1",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "48000",
      sampleDepth: "16-bit",
      mono: true,
    },
  },
  {
    id: "digitakt-ii",
    name: "Digitakt II",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "48000",
    },
  },
  {
    id: "multigrain",
    name: "Multigrain",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
    },
  },
  {
    id: "model-samples",
    name: "Model:Samples",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "48000",
      sampleDepth: "16-bit",
      mono: true,
    },
  },
  {
    id: "op-1",
    name: "OP-1",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      sampleRate: "44100",
      sampleDepth: "16-bit",
    },
  },
  {
    id: "op-1-field",
    name: "OP-1 Field",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      sampleRate: "44100",
    },
  },
  {
    id: "sp-404sx",
    name: "SP-404SX",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      sampleRate: "44100",
      sampleDepth: "16-bit",
    },
  },
  {
    id: "sp-404a",
    name: "SP-404A",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      sampleRate: "44100",
      sampleDepth: "16-bit",
    },
  },
  {
    id: "sp-404mkii",
    name: "SP-404MKII",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      sampleRate: "44100",
    },
  },
  {
    id: "volca-sample-v1-v2",
    name: "Volca Sample (v1/v2)",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "31250",
      sampleDepth: "16-bit",
      mono: true,
    },
  },
  {
    id: "electribe-2-sampler",
    name: "Electribe 2 Sampler",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "48000",
      sampleDepth: "16-bit",
      mono: true,
    },
  },
  {
    id: "squid-salmple",
    name: "Squid Salmple",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      mono: true,
    },
  },
  {
    id: "morphagene",
    name: "Morphagene",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      sampleRate: "48000",
    },
  },
  {
    id: "erica-sampledrum",
    name: "Erica Synths Sampledrum",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      sampleRate: "44100",
    },
  },
  {
    id: "tiptop-one",
    name: "Tiptop One",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      sampleRate: "44100",
      mono: true,
    },
  },
  {
    id: "4ms-sts",
    name: "4MS STS",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      sampleRate: "44100",
    },
  },
  {
    id: "addac-112",
    name: "ADDAC 112 Looper & Granular Sampler",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      sampleRate: "44100",
    },
  },
  {
    id: "addac-wavplayer",
    name: "ADDAC 101 WAV Player",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      sampleRate: "44100",
      mono: true,
    },
  },
  {
    id: "disting-mk4",
    name: "Disting MK4",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleDepth: "16-bit",
      sampleRate: "44100",
      mono: true,
    },
  },
  {
    id: "polyend-tracker",
    name: "Polyend Tracker",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "44100",
    },
  },
  {
    id: "polyend-play",
    name: "Polyend Play",
    settings: {
      ...DEFAULT_FORMAT_SETTINGS,
      fileFormat: "WAV",
      sampleRate: "44100",
    },
  },
];

interface FormatPresetStoreState {
  currentPreset: FormatPreset;
  selectedPresetId: string;
  devicePresets: FormatPreset[];
  updateCurrentPreset: (settings: Partial<FormatSettings>) => void;
  applyDevicePreset: (presetId: string) => void;
}

export const useFormatPresetStore = create<FormatPresetStoreState>((set, get) => ({
  currentPreset: {
    id: "current",
    name: "User",
    settings: DEFAULT_FORMAT_SETTINGS,
  },
  selectedPresetId: "current",
  devicePresets: DEVICE_PRESETS,
  updateCurrentPreset: (settings) =>
    set((state) => ({
      currentPreset: {
        ...state.currentPreset,
        settings: { ...state.currentPreset.settings, ...settings },
      },
      selectedPresetId: "current",
    })),
  applyDevicePreset: (presetId) => {
    const preset = get().devicePresets.find((p) => p.id === presetId);
    if (!preset) {
      set({ selectedPresetId: "current" });
      return;
    }

    set((state) => ({
      selectedPresetId: presetId,
      currentPreset: {
        ...state.currentPreset,
        settings: { ...preset.settings },
      },
    }));
  },
}));
