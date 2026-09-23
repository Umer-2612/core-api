import { beforeEach, describe, expect, it } from "vitest";
import type { ExecuteResult, IJudgeClient } from "@modules/portal/judge-client";
import type { IPortalRepository, PortalSession } from "@modules/portal/portal.repository";
import { PortalService } from "@modules/portal/portal.service";
import type { InterviewRound, Question, QuestionSubmission, TestCase } from "@shared/interfaces/models.interface";

function makeTestCases(): TestCase[] {
  // expected_output === input for every case, so the FakeJudgeClient (an echo judge)
  // "solves" them all, letting tests assert clean pass/fail counts without a real judge.
  return [
    { input: "1", expected_output: "1", locked: false },
    { input: "2", expected_output: "2", locked: false },
    { input: "3", expected_output: "3", locked: false },
    { input: "4", expected_output: "4", locked: true },
    { input: "5", expected_output: "5", locked: true },
  ];
}

function makeRound(overrides: Partial<InterviewRound> = {}): InterviewRound {
  return {
    id: "round-1",
    session_id: "session-1",
    round_type: "dsa",
    sequence: 1,
    status: "pending",
    question_ids: [],
    started_at: null,
    submissions: null,
    created_at: new Date(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<PortalSession> = {}): PortalSession {
  return {
    id: "session-1",
    job_id: "job-1",
    candidate_id: "candidate-1",
    access_token: "tok-abc",
    scheduled_at: new Date("2026-02-01T10:00:00Z"),
    status: "scheduled",
    created_by: "hm-1",
    created_at: new Date("2026-01-01T00:00:00Z"),
    candidate: { full_name: "Jane Doe" },
    job: { title: "Backend Engineer" },
    rounds: [
      makeRound({ id: "round-dsa", round_type: "dsa" }),
      makeRound({ id: "round-vscode", round_type: "vscode" }),
      makeRound({ id: "round-ai", round_type: "technical_ai" }),
    ],
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "question-1",
    title: "Two Sum",
    prompt: "Find two indices that sum to target.",
    difficulty: "easy",
    tags: ["arrays", "hash-map"],
    starter_code: { javascript: "// start here\n" },
    test_cases: makeTestCases() as unknown as Question["test_cases"],
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

class FakePortalRepository implements IPortalRepository {
  sessions: PortalSession[] = [];
  questions: Question[] = [];

  async findSessionByToken(token: string) {
    return this.sessions.find((s) => s.access_token === token) ?? null;
  }

  async findQuestionsByIds(ids: string[]) {
    return this.questions.filter((q) => ids.includes(q.id));
  }

  async findRandomQuestions(count: number) {
    return this.questions.slice(0, count);
  }

  private findRound(roundId: string): InterviewRound {
    for (const session of this.sessions) {
      const round = session.rounds.find((r) => r.id === roundId);
      if (round) return round;
    }
    throw new Error(`round ${roundId} not found in fakes`);
  }

  async assignQuestions(roundId: string, questionIds: string[]) {
    const round = this.findRound(roundId);
    round.question_ids = questionIds;
    return round;
  }

  async startRound(roundId: string) {
    const round = this.findRound(roundId);
    round.started_at = new Date("2026-03-01T09:00:00Z");
    return round;
  }

  async saveSubmission(roundId: string, submissions: Record<string, QuestionSubmission>, complete: boolean) {
    const round = this.findRound(roundId);
    round.submissions = submissions as unknown as InterviewRound["submissions"];
    if (complete) round.status = "completed";
    return round;
  }
}

class FakeJudgeClient implements IJudgeClient {
  async execute(_languageId: number, _code: string, stdin: string): Promise<ExecuteResult> {
    return { success: true, stdout: stdin };
  }
}

describe("PortalService", () => {
  let repo: FakePortalRepository;
  let service: PortalService;

  beforeEach(() => {
    repo = new FakePortalRepository();
    repo.sessions.push(makeSession());
    repo.questions.push(makeQuestion({ id: "question-1", title: "Q1" }), makeQuestion({ id: "question-2", title: "Q2" }));
    service = new PortalService(repo, new FakeJudgeClient());
  });

  describe("getPortal", () => {
    it("returns candidate/job context and every round's status", async () => {
      const portal = await service.getPortal("tok-abc");
      expect(portal.candidate_name).toBe("Jane Doe");
      expect(portal.job_title).toBe("Backend Engineer");
      expect(portal.rounds.map((r) => r.round_type)).toEqual(["dsa", "vscode", "technical_ai"]);
    });

    it("404s for an unknown token", async () => {
      await expect(service.getPortal("nope")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("getDsaRound", () => {
    it("assigns two random questions the first time it's opened", async () => {
      const view = await service.getDsaRound("tok-abc");
      expect(view.questions).toHaveLength(2);
      expect(view.status).toBe("pending");
      expect(view.started_at).toBeNull();
      expect(view.duration_minutes).toBe(60);
    });

    it("keeps returning the same questions on a later fetch instead of reassigning", async () => {
      const first = await service.getDsaRound("tok-abc");
      repo.questions.push(makeQuestion({ id: "question-3", title: "Q3" }));

      const second = await service.getDsaRound("tok-abc");
      expect(second.questions.map((q) => q.id)).toEqual(first.questions.map((q) => q.id));
    });

    it("only exposes unlocked test cases to the candidate", async () => {
      const view = await service.getDsaRound("tok-abc");
      expect(view.questions[0]?.open_test_cases).toHaveLength(3);
      expect(view.questions[0]?.total_test_cases).toBe(5);
    });

    it("404s for an unknown token", async () => {
      await expect(service.getDsaRound("nope")).rejects.toMatchObject({ status: 404 });
    });

    it("503s when the question pool is empty", async () => {
      repo.questions = [];
      await expect(service.getDsaRound("tok-abc")).rejects.toMatchObject({ status: 503 });
    });
  });

  describe("startDsaRound", () => {
    it("sets started_at the first time it's called", async () => {
      const result = await service.startDsaRound("tok-abc");
      expect(result.started_at).toBeTruthy();
    });

    it("is idempotent, a second call returns the same start time unchanged", async () => {
      const first = await service.startDsaRound("tok-abc");
      const second = await service.startDsaRound("tok-abc");
      expect(second.started_at).toBe(first.started_at);
    });
  });

  describe("runDsaTests", () => {
    it("400s if the round hasn't started yet", async () => {
      await service.getDsaRound("tok-abc");
      const questionId = repo.sessions[0]!.rounds[0]!.question_ids[0]!;
      await expect(service.runDsaTests("tok-abc", questionId, { code: "x", language: "python" })).rejects.toMatchObject({
        status: 400,
      });
    });

    it("grades against every test case without saving a submission", async () => {
      await service.getDsaRound("tok-abc");
      await service.startDsaRound("tok-abc");
      const questionId = repo.sessions[0]!.rounds[0]!.question_ids[0]!;

      const result = await service.runDsaTests("tok-abc", questionId, { code: "x", language: "python" });
      expect(result.total).toBe(5);
      expect(result.passed).toBe(5);
      expect(repo.sessions[0]!.rounds[0]!.submissions).toBeNull();
    });

    it("400s for an unsupported language", async () => {
      await service.getDsaRound("tok-abc");
      await service.startDsaRound("tok-abc");
      const questionId = repo.sessions[0]!.rounds[0]!.question_ids[0]!;
      await expect(
        service.runDsaTests("tok-abc", questionId, { code: "x", language: "cobol" }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("404s for a question that isn't part of this round", async () => {
      await service.getDsaRound("tok-abc");
      await service.startDsaRound("tok-abc");
      await expect(
        service.runDsaTests("tok-abc", "not-in-this-round", { code: "x", language: "python" }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("submitDsaQuestion", () => {
    it("saves the submission with its test results", async () => {
      await service.getDsaRound("tok-abc");
      await service.startDsaRound("tok-abc");
      const questionId = repo.sessions[0]!.rounds[0]!.question_ids[0]!;

      const submission = await service.submitDsaQuestion("tok-abc", questionId, { code: "x", language: "python" });
      expect(submission.test_results).toEqual({ passed: 5, total: 5 });
    });

    it("409s on a second submission of the same question", async () => {
      await service.getDsaRound("tok-abc");
      await service.startDsaRound("tok-abc");
      const questionId = repo.sessions[0]!.rounds[0]!.question_ids[0]!;
      await service.submitDsaQuestion("tok-abc", questionId, { code: "x", language: "python" });

      await expect(
        service.submitDsaQuestion("tok-abc", questionId, { code: "y", language: "python" }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("only marks the round completed once every question in it has been submitted", async () => {
      await service.getDsaRound("tok-abc");
      await service.startDsaRound("tok-abc");
      const [q1, q2] = repo.sessions[0]!.rounds[0]!.question_ids;

      await service.submitDsaQuestion("tok-abc", q1!, { code: "x", language: "python" });
      expect(repo.sessions[0]!.rounds[0]!.status).toBe("pending");

      await service.submitDsaQuestion("tok-abc", q2!, { code: "x", language: "python" });
      expect(repo.sessions[0]!.rounds[0]!.status).toBe("completed");
    });

    it("400s if the round hasn't started yet", async () => {
      await service.getDsaRound("tok-abc");
      const questionId = repo.sessions[0]!.rounds[0]!.question_ids[0]!;
      await expect(
        service.submitDsaQuestion("tok-abc", questionId, { code: "x", language: "python" }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
