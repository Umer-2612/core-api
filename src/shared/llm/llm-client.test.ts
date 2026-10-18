import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GroqClient, LlmUnavailableError } from "@shared/llm/llm-client";

const schema = z.object({ summary: z.string(), score: z.number() });

function reply(content: string, ok = true, status = 200) {
  return { ok, status, json: async () => ({ choices: [{ message: { content } }] }) } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("GroqClient", () => {
  it("reports itself unconfigured and refuses to call without a key", async () => {
    const client = new GroqClient("", "m", "http://x");
    expect(client.isConfigured).toBe(false);
    await expect(client.completeJson("s", "u", schema)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("returns the validated JSON the model produced", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('{"summary":"ok","score":7}'));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new GroqClient("key", "m", "http://llm").completeJson("sys", "usr", schema);
    expect(result).toEqual({ summary: "ok", score: 7 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://llm/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(init.body).response_format).toEqual({ type: "json_object" });
  });

  it("retries once when the JSON fails validation, then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply('{"summary":"missing score"}')).mockResolvedValueOnce(reply('{"summary":"fixed","score":3}'));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new GroqClient("key", "m", "http://llm").completeJson("sys", "usr", schema);
    expect(result.score).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after two invalid responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("not json")));
    await expect(new GroqClient("key", "m", "http://llm").completeJson("sys", "usr", schema)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("maps provider errors to LlmUnavailableError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("", false, 429)));
    await expect(new GroqClient("key", "m", "http://llm").completeJson("sys", "usr", schema)).rejects.toThrow(/429/);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(new GroqClient("key", "m", "http://llm").completeJson("sys", "usr", schema)).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});
