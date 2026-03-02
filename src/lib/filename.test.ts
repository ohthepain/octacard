import { describe, it, expect } from "vitest";
import { sanitizeFilename, sanitizeFilenameMinimal } from "./filename";

describe("sanitizeFilenameMinimal", () => {
  it("preserves Swedish characters (å, ä, ö)", () => {
    expect(sanitizeFilenameMinimal("Mål.wav")).toBe("Mål.wav");
    expect(sanitizeFilenameMinimal("Melô.wav")).toBe("Melô.wav");
    expect(sanitizeFilenameMinimal("Ängelholm.wav")).toBe("Ängelholm.wav");
  });

  it("strips path separators and control chars", () => {
    expect(sanitizeFilenameMinimal("track/name.wav")).toBe("track_name.wav");
    expect(sanitizeFilenameMinimal("track\\name.wav")).toBe("track_name.wav");
    expect(sanitizeFilenameMinimal("track\x00null.wav")).toBe("track_null.wav");
  });

  it("strips Windows-reserved chars", () => {
    expect(sanitizeFilenameMinimal("file:name.wav")).toBe("file_name.wav");
    expect(sanitizeFilenameMinimal("a*b?c.wav")).toBe("a_b_c.wav");
  });
});

describe("sanitizeFilename", () => {
  it("transliterates for device compatibility", () => {
    expect(sanitizeFilename("Melô.wav")).toBe("Melo.wav");
    expect(sanitizeFilename("Mål.wav")).toBe("Mal.wav");
  });
});
