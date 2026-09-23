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
 * at once). Locked cases are graded but their input/expected/actual output never
 * leaves this function, only pass/fail, same as a typical online judge; unlocked
 * (worked-example) cases return full detail so the candidate can see what happened. */
export async function gradeSubmission(
  testCases: TestCase[],
  languageId: number,
  code: string,
  judgeClient: IJudgeClient,
): Promise<GradeResult> {
  const results: GradedTestCase[] = [];
  let passed = 0;

  for (const testCase of testCases) {
    const execution = await judgeClient.execute(languageId, code, testCase.input);
    const actual = (execution.stdout ?? "").trim();
    const expected = testCase.expected_output.trim();
    const isPass = execution.success === true && actual === expected;
    if (isPass) passed += 1;

    results.push(
      testCase.locked
        ? { locked: true, passed: isPass }
        : {
            locked: false,
            passed: isPass,
            input: testCase.input,
            expected_output: testCase.expected_output,
            actual_output: execution.stdout || execution.stderr || execution.error || "",
          },
    );
  }

  return { results, passed, total: testCases.length };
}
