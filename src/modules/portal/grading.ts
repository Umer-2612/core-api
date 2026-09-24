import type { IJudgeClient } from "@modules/portal/judge-client";
import type { TestCase } from "@shared/interfaces/models.interface";

export interface GradedTestCase {
  locked: boolean;
  passed: boolean;
  input?: string;
  expected_output?: string;
  actual_output?: string;
}

export interface GradeResult {
  results: GradedTestCase[];
  passed: number;
  total: number;
}

/** Runs code against every one of a question's test cases via judge-service, one at a
 * time (a single local Judge0 worker shouldn't be hit with 15-20 concurrent requests
 * at once, and this also lets `onResult` report progress case by case instead of only
 * at the very end). Locked cases are graded but their input/expected/actual output
 * never leaves this function, only pass/fail, same as a typical online judge; unlocked
 * (worked-example) cases return full detail so the candidate can see what happened.
 *
 * `onResult`, if given, is called once per test case as it finishes (index is
 * 0-based), so a caller can stream progress to a client instead of waiting for every
 * case to finish before reporting anything. */
export async function gradeSubmission(
  testCases: TestCase[],
  languageId: number,
  code: string,
  judgeClient: IJudgeClient,
  onResult?: (index: number, result: GradedTestCase) => void,
): Promise<GradeResult> {
  const results: GradedTestCase[] = [];
  let passed = 0;

  for (let index = 0; index < testCases.length; index += 1) {
    const testCase = testCases[index]!;
    const execution = await judgeClient.execute(languageId, code, testCase.input);
    const actual = (execution.stdout ?? "").trim();
    const expected = testCase.expected_output.trim();
    const isPass = execution.success === true && actual === expected;
    if (isPass) passed += 1;

    const result: GradedTestCase = testCase.locked
      ? { locked: true, passed: isPass }
      : {
          locked: false,
          passed: isPass,
          input: testCase.input,
          expected_output: testCase.expected_output,
          actual_output: execution.stdout || execution.stderr || execution.error || "",
        };

    results.push(result);
    onResult?.(index, result);
  }

  return { results, passed, total: testCases.length };
}
