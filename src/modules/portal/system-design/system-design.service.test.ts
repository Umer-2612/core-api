import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPortalRepository, PortalSession } from "@modules/portal/portal.repository";
import { SystemDesignAi } from "@modules/portal/system-design/ai";
import type { ISystemDesignRepository } from "@modules/portal/system-design/system-design.repository";
import { SystemDesignPortalService, type SimulateEvent, type SubmitEvent } from "@modules/portal/system-design/system-design.service";
import type { Board } from "@modules/portal/system-design/types";
import type { InterviewRound, SystemDesignProblem } from "@shared/interfaces/models.interface";
import { LlmUnavailableError, type ILlmClient } from "@shared/llm/llm-client";

const REQUIREMENTS = { target_rps: 50_000, read_ratio: 0.9, peak_multiplier: 3, data_size_gb: 100, latency_slo_ms: 200, availability_slo: 99.9 };

const BOARD: Board = {
  nodes: [
    { id: "u", type: "users" },
    { id: "app", type: "ec2" },
    { id: "db", type: "rds" },
  ],
  edges: [
    { id: "e1", source: "u", target: "app" },
    { id: "e2", source: "app", target: "db" },
  ],
};

function makeRound(overrides: Partial<InterviewRound> = {}): InterviewRound {
  return {
    id: "round-sd",
    session_id: "session-1",
    round_type: "system_design",
    sequence: 4,
    status: "pending",
    question_ids: [],
    started_at: new Date("2026-01-01T10:00:00Z"),
    submissions: null,
    focus_loss_events: null,
    system_design_problem_id: "problem-1",
    board: null,
    simulation_runs: 0,
    created_at: new Date(),
    ...overrides,
  };
}

function makeSession(round: InterviewRound): PortalSession {
  return {
    id: "session-1",
    job_id: "job-1",
    candidate_id: "cand-1",
    access_token: "tok",
    scheduled_at: new Date(),
    status: "scheduled",
    created_by: "hm-1",
    created_at: new Date(),
    rounds: [round],
    candidate: { full_name: "Ada" },
    job: { title: "Backend" },
  };
}

const PROBLEM: SystemDesignProblem = {
  id: "problem-1",
  company_id: null,
  created_by: null,
  title: "URL Shortener",
  prompt: "Design it",
  difficulty: "easy",
  requirements: REQUIREMENTS,
  created_at: new Date(),
};

interface Setup {
  service: SystemDesignPortalService;
  portal: { findSessionByToken: ReturnType<typeof vi.fn>; startRound: ReturnType<typeof vi.fn> };
  repo: Record<keyof ISystemDesignRepository, ReturnType<typeof vi.fn>>;
  llm: { isConfigured: boolean; completeJson: ReturnType<typeof vi.fn> };
}

function setup(round: InterviewRound, opts: { aiConfigured?: boolean } = {}): Setup {
  const portal = { findSessionByToken: vi.fn().mockResolvedValue(makeSession(round)), startRound: vi.fn() };
  const repo = {
    findProblemById: vi.fn().mockResolvedValue(PROBLEM),
    startRoundOnce: vi.fn().mockResolvedValue(new Date("2026-02-02T00:00:00Z")),
    saveBoard: vi.fn().mockResolvedValue(undefined),
    reserveSimulationRun: vi.fn().mockResolvedValue(true),
    releaseSimulationRun: vi.fn().mockResolvedValue(undefined),
    completeRound: vi.fn().mockResolvedValue(round),
  };
  const llm = { isConfigured: opts.aiConfigured ?? true, completeJson: vi.fn() };
  const service = new SystemDesignPortalService(portal as unknown as IPortalRepository, repo as unknown as ISystemDesignRepository, new SystemDesignAi(llm as unknown as ILlmClient));
  return { service, portal, repo, llm };
}

const collect = async (run: (emit: (e: SimulateEvent) => void) => Promise<void>) => {
  const events: SimulateEvent[] = [];
  await run((e) => events.push(e));
  return events;
};

describe("SystemDesignPortalService", () => {
  let ctx: Setup;
  beforeEach(() => {
    ctx = setup(makeRound());
  });

  describe("getRound", () => {
    it("returns the problem, saved board and AI status, never the submission", async () => {
      ctx = setup(makeRound({ board: BOARD as never, submissions: { evaluation: "secret" } as never, status: "completed" }));
      const view = await ctx.service.getRound("tok");
      expect(view.problem.title).toBe("URL Shortener");
      expect(view.board).toEqual(BOARD);
      expect(view.runs_max).toBe(8);
      expect(view.ai_enabled).toBe(true);
      expect(JSON.stringify(view)).not.toContain("secret");
    });

    it("returns an empty board when nothing was saved", async () => {
      expect((await ctx.service.getRound("tok")).board).toEqual({ nodes: [], edges: [] });
    });

    it("404s when the interview has no system design round or no assigned problem", async () => {
      ctx.portal.findSessionByToken.mockResolvedValue(null);
      await expect(ctx.service.getRound("tok")).rejects.toMatchObject({ status: 404 });
      ctx = setup(makeRound({ system_design_problem_id: null }));
      await expect(ctx.service.getRound("tok")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("startRound", () => {
    it("is idempotent once started", async () => {
      const result = await ctx.service.startRound("tok");
      expect(result.started_at).toBe("2026-01-01T10:00:00.000Z");
      expect(ctx.portal.startRound).not.toHaveBeenCalled();
    });

    it("starts the clock the first time", async () => {
      ctx = setup(makeRound({ started_at: null }));
      expect((await ctx.service.startRound("tok")).started_at).toBe("2026-02-02T00:00:00.000Z");
      expect(ctx.repo.startRoundOnce).toHaveBeenCalledWith("round-sd");
      expect(ctx.portal.startRound).not.toHaveBeenCalled();
    });
  });

  describe("board access guards", () => {
    it("refuses saving or simulating before the round starts", async () => {
      ctx = setup(makeRound({ started_at: null }));
      await expect(ctx.service.saveBoard("tok", BOARD)).rejects.toMatchObject({ status: 400 });
      await expect(collect((emit) => ctx.service.simulate("tok", BOARD, "steady", emit))).rejects.toMatchObject({ status: 400 });
    });

    it("refuses everything once submitted", async () => {
      ctx = setup(makeRound({ status: "completed" }));
      await expect(ctx.service.saveBoard("tok", BOARD)).rejects.toMatchObject({ status: 409 });
      await expect(ctx.service.submit("tok", BOARD, () => undefined)).rejects.toMatchObject({ status: 409 });
    });

    it("saves the board", async () => {
      await ctx.service.saveBoard("tok", BOARD);
      expect(ctx.repo.saveBoard).toHaveBeenCalledWith("round-sd", BOARD);
    });
  });

  describe("simulate", () => {
    it("streams the engine result first, then the AI hint, and counts the run", async () => {
      ctx.llm.completeJson.mockResolvedValue({ hints: [{ node_id: "app", text: "single instance" }] });
      const events = await collect((emit) => ctx.service.simulate("tok", BOARD, "spike", emit));
      expect(events.map((e) => e.type)).toEqual(["engine", "ai_hint", "done"]);
      const engine = events[0] as Extract<SimulateEvent, { type: "engine" }>;
      expect(engine.result.scenario).toBe("spike");
      expect(engine.result.offered_rps).toBe(150_000);
      expect(events[2]).toMatchObject({ type: "done", runs_used: 1, runs_max: 8 });
      expect(ctx.repo.reserveSimulationRun).toHaveBeenCalledWith("round-sd", 8);
    });

    it("skips the AI without a key but still returns the engine result", async () => {
      ctx = setup(makeRound(), { aiConfigured: false });
      const events = await collect((emit) => ctx.service.simulate("tok", BOARD, "steady", emit));
      expect(events.map((e) => e.type)).toEqual(["engine", "ai_skipped", "done"]);
      expect(events[1]).toMatchObject({ reason: "not_configured" });
      expect(ctx.repo.reserveSimulationRun).not.toHaveBeenCalled();
    });

    it("stops adding hints when the cap is reached", async () => {
      ctx.repo.reserveSimulationRun.mockResolvedValue(false);
      const events = await collect((emit) => ctx.service.simulate("tok", BOARD, "steady", emit));
      expect(events[1]).toMatchObject({ type: "ai_skipped", reason: "limit_reached" });
      expect(ctx.llm.completeJson).not.toHaveBeenCalled();
    });

    it("does not refund the hint run when the candidate disconnects mid-call (the LLM call was already billed)", async () => {
      const controller = new AbortController();
      ctx.llm.completeJson.mockImplementation(async () => {
        controller.abort();
        throw new LlmUnavailableError("aborted");
      });
      const events = await collect((emit) => ctx.service.simulate("tok", BOARD, "steady", emit, controller.signal));
      expect(ctx.repo.releaseSimulationRun).not.toHaveBeenCalled();
      expect(events[events.length - 1]).toMatchObject({ type: "done", runs_used: 1 });
    });

    it("gives the hint run back when the model fails", async () => {
      ctx.llm.completeJson.mockRejectedValue(new LlmUnavailableError("down"));
      const events = await collect((emit) => ctx.service.simulate("tok", BOARD, "steady", emit));
      expect(events[1]).toMatchObject({ type: "ai_skipped", reason: "unavailable" });
      expect(ctx.repo.releaseSimulationRun).toHaveBeenCalledWith("round-sd");
      expect(events[2]).toMatchObject({ type: "done", runs_used: 0 });
    });
  });

  describe("submit", () => {
    const evaluation = { summary: "fine", failure_points: [], scores: { scalability: 3, reliability: 3, security: 3, observability: 3, cost_efficiency: 3 }, strengths: [] };

    it("simulates all scenarios, evaluates, stores everything and completes the round", async () => {
      ctx.llm.completeJson.mockResolvedValue(evaluation);
      const events: SubmitEvent[] = [];
      await ctx.service.submit("tok", BOARD, (e) => events.push(e));
      expect(events.map((e) => (e.type === "progress" ? e.stage : e.type))).toEqual(["simulating", "evaluating", "saving", "done"]);
      const [roundId, submission, board] = ctx.repo.completeRound.mock.calls[0];
      expect(roundId).toBe("round-sd");
      expect(board).toEqual(BOARD);
      expect(Object.keys(submission.engine_results)).toEqual(["steady", "spike", "az_failure"]);
      expect(submission.evaluation_status).toBe("ok");
      expect(submission.evaluation.overall).toBe(3);
    });

    it("still stores the engine results when the model is unavailable", async () => {
      ctx.llm.completeJson.mockRejectedValue(new LlmUnavailableError("down"));
      await ctx.service.submit("tok", BOARD, () => undefined);
      const submission = ctx.repo.completeRound.mock.calls[0][1];
      expect(submission.evaluation).toBeNull();
      expect(submission.evaluation_status).toBe("unavailable");
    });

    it("doesn't spend an LLM call on an empty board", async () => {
      await ctx.service.submit("tok", { nodes: [], edges: [] }, () => undefined);
      expect(ctx.llm.completeJson).not.toHaveBeenCalled();
      expect(ctx.repo.completeRound.mock.calls[0][1].evaluation_status).toBe("skipped");
    });

    it("rejects a second submit while one is in flight, so only one LLM evaluation is paid for", async () => {
      let release!: () => void;
      ctx.llm.completeJson.mockImplementation(() => new Promise((resolve) => { release = () => resolve(evaluation); }));
      const first = ctx.service.submit("tok", BOARD, () => undefined);
      await vi.waitFor(() => expect(ctx.llm.completeJson).toHaveBeenCalledTimes(1));
      await expect(ctx.service.submit("tok", BOARD, () => undefined)).rejects.toMatchObject({ status: 409 });
      release();
      await first;
      expect(ctx.llm.completeJson).toHaveBeenCalledTimes(1);
      // the guard is released afterwards, so a later attempt reaches the database check again
      ctx.llm.completeJson.mockResolvedValue(evaluation);
      ctx.repo.completeRound.mockResolvedValue(null);
      await expect(ctx.service.submit("tok", BOARD, () => undefined)).rejects.toMatchObject({ status: 409, message: "This round has already been submitted" });
    });

    it("409s when another request already completed the round", async () => {
      ctx.repo.completeRound.mockResolvedValue(null);
      await expect(ctx.service.submit("tok", BOARD, () => undefined)).rejects.toMatchObject({ status: 409 });
    });
  });
});
