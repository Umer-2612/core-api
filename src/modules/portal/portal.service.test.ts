import { beforeEach, describe, expect, it } from "vitest";
import type { IPortalRepository, PortalSession } from "@modules/portal/portal.repository";
import { PortalService } from "@modules/portal/portal.service";
import type { InterviewRound, Question, RoundSubmission } from "@shared/interfaces/models.interface";

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
      { id: "round-dsa", session_id: "session-1", round_type: "dsa", sequence: 1, status: "pending", question_id: null, submission: null, created_at: new Date() },
      { id: "round-vscode", session_id: "session-1", round_type: "vscode", sequence: 2, status: "pending", question_id: null, submission: null, created_at: new Date() },
      { id: "round-ai", session_id: "session-1", round_type: "technical_ai", sequence: 3, status: "pending", question_id: null, submission: null, created_at: new Date() },
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

  async findQuestionById(id: string) {
    return this.questions.find((q) => q.id === id) ?? null;
  }

  async findRandomQuestion() {
    return this.questions[0] ?? null;
  }

  private findRound(roundId: string): InterviewRound {
    for (const session of this.sessions) {
      const round = session.rounds.find((r) => r.id === roundId);
      if (round) return round;
    }
    throw new Error(`round ${roundId} not found in fakes`);
  }

  async assignQuestion(roundId: string, questionId: string) {
    const round = this.findRound(roundId);
    round.question_id = questionId;
    return round;
  }

  async submitRound(roundId: string, submission: RoundSubmission) {
    const round = this.findRound(roundId);
    round.submission = submission as unknown as InterviewRound["submission"];
    round.status = "completed";
    return round;
  }
}

describe("PortalService", () => {
  let repo: FakePortalRepository;
  let service: PortalService;

  beforeEach(() => {
    repo = new FakePortalRepository();
    repo.sessions.push(makeSession());
    repo.questions.push(makeQuestion());
    service = new PortalService(repo);
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
    it("assigns a random question the first time it's opened", async () => {
      const view = await service.getDsaRound("tok-abc");
      expect(view.question.id).toBe("question-1");
      expect(view.question.tags).toEqual(["arrays", "hash-map"]);
      expect(view.round.status).toBe("pending");
      expect(view.round.submission).toBeNull();
    });

    it("keeps returning the same question on a later fetch instead of reassigning", async () => {
      await service.getDsaRound("tok-abc");
      repo.questions.push(makeQuestion({ id: "question-2", title: "Reverse String" }));

      const second = await service.getDsaRound("tok-abc");
      expect(second.question.id).toBe("question-1");
    });

    it("404s for an unknown token", async () => {
      await expect(service.getDsaRound("nope")).rejects.toMatchObject({ status: 404 });
    });

    it("503s when the question pool is empty", async () => {
      repo.questions = [];
      await expect(service.getDsaRound("tok-abc")).rejects.toMatchObject({ status: 503 });
    });
  });

  describe("submitDsaRound", () => {
    it("saves the final code and marks the round completed", async () => {
      const round = await service.submitDsaRound("tok-abc", { code: "console.log(1)", language: "javascript" });
      expect(round.status).toBe("completed");
      expect((round.submission as unknown as RoundSubmission).code).toBe("console.log(1)");
      expect((round.submission as unknown as RoundSubmission).language).toBe("javascript");
    });

    it("409s on a second submission of the same round", async () => {
      await service.submitDsaRound("tok-abc", { code: "a", language: "javascript" });
      await expect(service.submitDsaRound("tok-abc", { code: "b", language: "javascript" })).rejects.toMatchObject({
        status: 409,
      });
    });

    it("404s for an unknown token", async () => {
      await expect(service.submitDsaRound("nope", { code: "a", language: "javascript" })).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
