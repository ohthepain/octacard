import { describe, it, expect, vi, beforeEach } from "vitest";
import { deletePack } from "./remote-library";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const { apiFetch } = await import("./api-client");

describe("deletePack", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("sends DELETE request to correct endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await deletePack("pack-123");

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/library/packs/pack-123", { method: "DELETE" });
  });

  it("resolves when server returns 200", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(deletePack("pack-123")).resolves.toBeUndefined();
  });

  it("throws with server message when pack must be private", async () => {
    const message = "This pack must be private before it can be deleted. Make it private first, then try again.";
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ message }), { status: 400 }),
    );

    await expect(deletePack("pack-123")).rejects.toThrow(message);
  });

  it("throws with server message when other users have purchased", async () => {
    const message = "This pack cannot be deleted because other users have purchased samples from it.";
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ message }), { status: 400 }),
    );

    await expect(deletePack("pack-123")).rejects.toThrow(message);
  });

  it("throws with server message when pack not found", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Pack not found" }), { status: 404 }),
    );

    await expect(deletePack("pack-123")).rejects.toThrow("Pack not found");
  });

  it("throws with raw text when response is not JSON", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response("Server error", { status: 500 }),
    );

    await expect(deletePack("pack-123")).rejects.toThrow("Server error");
  });

  it("throws with status when response has no message", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response("{}", { status: 500 }),
    );

    await expect(deletePack("pack-123")).rejects.toThrow("Failed to delete pack (500)");
  });
});
