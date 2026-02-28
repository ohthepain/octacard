import assert from "node:assert/strict";

export async function assertFilenameShortener(page) {
  const shortenerCases = await page.evaluate(() => {
    const shortenMany = window.__octacardShortenFilenames;
    const shortened = shortenMany({
      folderName: "Drum Loops",
      filenames: ["Drum_loops_drum_loops_big_snare_stereo_version.wav"],
      maxLength: 24,
    });

    const collisions = shortenMany({
      folderName: "FX",
      filenames: ["instrumental_long_take_version.wav", "instrumental-long-take-version.wav"],
      maxLength: 24,
    });
    const keepsMoreContextOnCollision = shortenMany({
      folderName: "MD",
      filenames: ["MD_Drum15_kick&clap_121.wav", "MD_Drum15_nokick_121.wav"],
      maxLength: 16,
    });

    const unchanged = shortenMany({
      folderName: "Alpha",
      filenames: ["kick.wav"],
      maxLength: 24,
    });

    return {
      shortened: shortened["Drum_loops_drum_loops_big_snare_stereo_version.wav"],
      firstCollision: collisions["instrumental_long_take_version.wav"],
      secondCollision: collisions["instrumental-long-take-version.wav"],
      firstDrumCollision: keepsMoreContextOnCollision["MD_Drum15_kick&clap_121.wav"],
      secondDrumCollision: keepsMoreContextOnCollision["MD_Drum15_nokick_121.wav"],
      unchanged: unchanged["kick.wav"],
    };
  });

  assert.equal(shortenerCases.shortened, "big_snare_st_v.wav");
  assert.equal(shortenerCases.firstCollision, "inst_long_tk_v.wav");
  assert.equal(shortenerCases.secondCollision, "inst_long_tk_v_2.wav");
  assert.equal(shortenerCases.firstDrumCollision, "Drum15_121.wav");
  assert.equal(shortenerCases.secondDrumCollision, "Drum15_121_2.wav");
  assert.equal(shortenerCases.unchanged, "kick.wav");

  const integrationResult = await page.evaluate(async () => {
    window.__convertCalls = [];
    window.__convertedOutputNames = [];
    const result = await window.__octacardTestHooks.convertAndCopyFile({
      sourceVirtualPath: "/Alpha/Long Mélô Instrumental Version.wav",
      destVirtualPath: "/Beta",
      fileName: "Long Mélô Instrumental Version.wav",
      sanitizeFilename: true,
      shortenFilename: true,
      shortenFilenameMaxLength: 20,
      sourcePane: "source",
      destPane: "dest",
    });

    return {
      success: result.success,
      convertCall: window.__convertCalls[window.__convertCalls.length - 1],
      outputNames: window.__convertedOutputNames.slice(),
    };
  });

  assert.equal(integrationResult.success, true, "Expected mock conversion hook to succeed.");
  assert.equal(integrationResult.convertCall.shortenFilename, true, "Expected shortener flag on conversion call.");
  assert.equal(
    integrationResult.convertCall.shortenFilenameMaxLength,
    20,
    "Expected max length to be passed to conversion call.",
  );
  assert.ok(
    integrationResult.outputNames.includes("Long_Melo_inst_v.wav"),
    "Expected converted output to include shortened + sanitized filename.",
  );
}
