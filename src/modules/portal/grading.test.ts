import { describe, expect, it } from "vitest";
import type { ExecuteResult, IJudgeClient } from "@modules/portal/judge-client";
import { gradeSubmission } from "@modules/portal/grading";
import type { TestCase } from "@shared/interfaces/models.interface";

class FakeJudgeClient implements IJudgeClient {
  constructor(private readonly outputs: Record<string, ExecuteResult>) {}

  async execute(_languageId: number, _code: string, stdin: string): Promise<ExecuteResult> {
    return this.outputs[stdin] ?? { success: true, stdout: "" };
  }
}

function testCase(overrides: Partial<TestCase> = {}): TestCase {
  return { input: "2 3", expected_output: "5", locked: false, ...overrides };
}

describe("gradeSubmission", () => {
  it("marks a matching test case as passed", async () => {
    const judge = new FakeJudgeClient({ "2 3": { success: true, stdout: "5\n" } });
    const result = await gradeSubmission([testCase({ input: "2 3", expected_output: "5" })], 71, "code", judge);

    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(result.results[0]).toMatchObject({ passed: true, locked: false });
  });

  it("trims whitespace before comparing actual output to expected", async () => {
    const judge = new FakeJudgeClient({ "2 3": { success: true, stdout: "5\n\n" } });
    const result = await gradeSubmission([testCase({ expected_output: "5\n" })], 71, "code", judge);

    expect(result.results[0]?.passed).toBe(true);
  });

  it("marks a mismatched test case as failed", async () => {
    const judge = new FakeJudgeClient({ "2 3": { success: true, stdout: "6\n" } });
    const result = await gradeSubmission([testCase()], 71, "code", judge);

    expect(result.passed).toBe(0);
    expect(result.results[0]?.passed).toBe(false);
  });

  it("treats a failed execution (compile error, timeout, ...) as a failed test case", async () => {
    const judge = new FakeJudgeClient({ "2 3": { success: false, error: "Code execution engine unavailable" } });
    const result = await gradeSubmission([testCase()], 71, "code", judge);

    expect(result.passed).toBe(0);
    expect(result.results[0]?.passed).toBe(false);
  });

  it("never includes input/expected/actual output for a locked test case", async () => {
    const judge = new FakeJudgeClient({ "2 3": { success: true, stdout: "6\n" } });
    const result = await gradeSubmission([testCase({ locked: true })], 71, "code", judge);

    expect(result.results[0]).toEqual({ locked: true, passed: false });
    expect(result.results[0]).not.toHaveProperty("input");
    expect(result.results[0]).not.toHaveProperty("expected_output");
    expect(result.results[0]).not.toHaveProperty("actual_output");
  });

  it("includes full detail for an unlocked test case", async () => {
    const judge = new FakeJudgeClient({ "2 3": { success: true, stdout: "6\n" } });
    const result = await gradeSubmission([testCase({ locked: false })], 71, "code", judge);

    expect(result.results[0]).toEqual({
      locked: false,
      passed: false,
      input: "2 3",
      expected_output: "5",
      actual_output: "6\n",
    });
  });

  it("grades every test case and totals the pass count correctly", async () => {
    const judge = new FakeJudgeClient({
      a: { success: true, stdout: "1" },
      b: { success: true, stdout: "wrong" },
      c: { success: true, stdout: "3" },
    });
    const result = await gradeSubmission(
      [
        testCase({ input: "a", expected_output: "1" }),
        testCase({ input: "b", expected_output: "2" }),
        testCase({ input: "c", expected_output: "3" }),
      ],
      71,
      "code",
      judge,
    );

    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
  });

  it("calls onResult once per test case, in order, as each one finishes", async () => {
    const judge = new FakeJudgeClient({
      a: { success: true, stdout: "1" },
      b: { success: true, stdout: "wrong" },
    });
    const calls: { index: number; passed: boolean }[] = [];

    await gradeSubmission(
      [testCase({ input: "a", expected_output: "1" }), testCase({ input: "b", expected_output: "2" })],
      71,
      "code",
      judge,
      (index, result) => calls.push({ index, passed: result.passed }),
    );

    expect(calls).toEqual([
      { index: 0, passed: true },
      { index: 1, passed: false },
    ]);
  });
});
