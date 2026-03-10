/**
 * Compute content hash (SHA-256) for audio files.
 * For WAV: hashes only the data chunk to exclude metadata (cue, iXML, etc).
 * For other formats: hashes the full file (metadata may affect hash).
 */
export async function computeAudioContentHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);

  if (file.name.toLowerCase().endsWith(".wav") && buffer.byteLength >= 12) {
    const riff = readAscii(view, 0, 4);
    const wave = readAscii(view, 8, 4);
    if (riff === "RIFF" && wave === "WAVE") {
      let pos = 12;
      while (pos + 8 <= buffer.byteLength) {
        const chunkId = readAscii(view, pos, 4);
        const chunkSize = view.getUint32(pos + 4, true);
        const chunkDataStart = pos + 8;
        const chunkDataEnd = chunkDataStart + chunkSize;
        if (chunkDataEnd > buffer.byteLength) break;
        if (chunkId === "data") {
          const dataSlice = buffer.slice(chunkDataStart, chunkDataEnd);
          return sha256Hex(dataSlice);
        }
        pos = chunkDataEnd;
      }
    }
  }

  return sha256Hex(buffer);
}

function readAscii(view: DataView, at: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(at + i));
  return s;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
