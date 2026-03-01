import { describe, it, expect } from "vitest";
import { shortenFilename, shortenFilenames } from "./filename-shortener";

describe("shortenFilename", () => {
  it("returns unchanged filename when within maxLength", () => {
    expect(shortenFilename({ folderName: "Alpha", filename: "kick.wav", maxLength: 24 })).toBe(
      "kick.wav",
    );
  });

  it("shortens long filename", () => {
    const result = shortenFilename({
      folderName: "Drum Loops",
      filename: "Drum_loops_drum_loops_big_snare_stereo_version.wav",
      maxLength: 24,
    });
    expect(result).toBe("big_snare_st_v.wav");
  });

  it("produces unique names for collision case", () => {
    const result = shortenFilenames({
      folderName: "MD",
      filenames: ["MD_Drum15_kick&clap_121.wav", "MD_Drum15_nokick_121.wav"],
      maxLength: 16,
    });
    expect(result["MD_Drum15_kick&clap_121.wav"]).toBe("Drum15_kick&clap.wav");
    expect(result["MD_Drum15_nokick_121.wav"]).toBe("Drum15_nokick.wav");
  });
});
