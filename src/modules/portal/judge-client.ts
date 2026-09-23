import { JUDGE_SERVICE_URL } from "@shared/config/env";

export interface ExecuteResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  error?: string;
}

export interface IJudgeClient {
  execute(languageId: number, code: string, stdin: string): Promise<ExecuteResult>;
}

/** Server-to-server client for judge-service, used only for grading a dsa
 * submission's test cases. Ad hoc "Run" with custom stdin is called directly
 * by the browser instead, never through core-api, see platform's README. */
export class JudgeClient implements IJudgeClient {
  async execute(languageId: number, code: string, stdin: string): Promise<ExecuteResult> {
    const response = await fetch(`${JUDGE_SERVICE_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language_id: languageId, code, stdin }),
    });
    return (await response.json()) as ExecuteResult;
  }
}
