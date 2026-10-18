import type { ZodType, ZodTypeDef } from "zod";
import { GROQ_API_KEY, LLM_BASE_URL, LLM_MODEL } from "@shared/config/env";

/** Thrown when no LLM is configured or the provider can't be reached/understood. Callers treat it
 * as "no AI commentary this time", never as a failed request. */
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/** Output type T, any input: schemas with `.transform` / `.catch` have a looser input. */
export type JsonSchema<T> = ZodType<T, ZodTypeDef, unknown>;

export interface ILlmClient {
  /** False when there is no API key; callers can skip building prompts at all. */
  readonly isConfigured: boolean;
  /** Ask for a JSON object and validate it against `schema`. */
  completeJson<T>(system: string, user: string, schema: JsonSchema<T>, signal?: AbortSignal): Promise<T>;
}

const REQUEST_TIMEOUT_MS = 45_000;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

/** Groq (or any OpenAI-compatible endpoint) via plain `fetch`, same style as JudgeClient. */
export class GroqClient implements ILlmClient {
  constructor(
    private readonly apiKey: string | undefined = GROQ_API_KEY,
    private readonly model: string = LLM_MODEL,
    private readonly baseUrl: string = LLM_BASE_URL,
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async completeJson<T>(system: string, user: string, schema: JsonSchema<T>, signal?: AbortSignal): Promise<T> {
    if (!this.apiKey) throw new LlmUnavailableError("GROQ_API_KEY is not set.");

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: `${system}\n\nRespond with a single JSON object and nothing else.` },
      { role: "user", content: user },
    ];

    let lastError = "";
    // One retry: models occasionally return JSON that parses but misses a field.
    for (let attempt = 0; attempt < 2; attempt++) {
      const content = await this.chat(messages, signal);
      try {
        return schema.parse(JSON.parse(content));
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        messages.push({ role: "assistant", content }, { role: "user", content: `That response was invalid (${lastError.slice(0, 500)}). Reply again with a corrected JSON object only.` });
      }
    }
    throw new LlmUnavailableError(`Model returned invalid JSON twice: ${lastError.slice(0, 300)}`);
  }

  private async chat(messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages, temperature: 0.2, max_tokens: 2048, response_format: { type: "json_object" } }),
        signal: controller.signal,
      });
      if (!response.ok) throw new LlmUnavailableError(`LLM provider returned HTTP ${response.status}.`);
      const body = (await response.json()) as ChatCompletionResponse;
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new LlmUnavailableError("LLM provider returned an empty response.");
      return content;
    } catch (err) {
      if (err instanceof LlmUnavailableError) throw err;
      if (signal?.aborted) throw err;
      throw new LlmUnavailableError(`LLM request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
