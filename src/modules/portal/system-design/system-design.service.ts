import { container } from "tsyringe";
import { SystemDesignAi, type EvaluationResult, type HintResult, type ProblemContext } from "@modules/portal/system-design/ai";
import { simulate, simulateAll } from "@modules/portal/system-design/engine";
import { requirementsSchema } from "@modules/portal/system-design/schemas";
import { MAX_AI_HINT_RUNS, SYSTEM_DESIGN_ROUND_DURATION_MINUTES } from "@modules/portal/system-design/system-design.constants";
import type { ISystemDesignRepository } from "@modules/portal/system-design/system-design.repository";
import { SystemDesignRepository } from "@modules/portal/system-design/system-design.repository";
import type { Board, ProblemRequirements, Scenario, SimulationResult } from "@modules/portal/system-design/types";
import type { IPortalRepository, PortalSession } from "@modules/portal/portal.repository";
import { PortalRepository } from "@modules/portal/portal.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { InterviewRound, InterviewRoundStatus, QuestionDifficulty } from "@shared/interfaces/models.interface";
import { logger } from "@shared/utils/logger";

export interface SystemDesignRoundView {
  round_id: string;
  status: InterviewRoundStatus;
  started_at: string | null;
  duration_minutes: number;
  problem: { id: string; title: string; prompt: string; difficulty: QuestionDifficulty; requirements: ProblemRequirements };
  board: Board;
  runs_used: number;
  runs_max: number;
  /** False when no LLM key is configured: the simulation still works, just without AI hints. */
  ai_enabled: boolean;
}

export type SimulateEvent =
  | { type: "engine"; result: SimulationResult }
  | { type: "ai_hint"; hints: HintResult["hints"]; runs_used: number; runs_max: number }
  | { type: "ai_skipped"; reason: "not_configured" | "limit_reached" | "unavailable" }
  | { type: "done"; runs_used: number; runs_max: number };

export type SubmitEvent = { type: "progress"; stage: "simulating" | "evaluating" | "saving" } | { type: "done" };

/** What lands in the round's `submissions` Json column. Only the hiring manager ever sees it. */
export interface SystemDesignSubmission {
  board: Board;
  engine_results: Record<Scenario, SimulationResult>;
  evaluation: EvaluationResult | null;
  evaluation_status: "ok" | "unavailable" | "skipped";
  submitted_at: string;
}

const EMPTY_BOARD: Board = { nodes: [], edges: [] };

export class SystemDesignPortalService {
  private readonly portalRepository: IPortalRepository;
  private readonly repository: ISystemDesignRepository;
  private readonly ai: SystemDesignAi;

  constructor(portalRepository?: IPortalRepository, repository?: ISystemDesignRepository, ai?: SystemDesignAi) {
    this.portalRepository = portalRepository ?? container.resolve(PortalRepository);
    this.repository = repository ?? container.resolve(SystemDesignRepository);
    this.ai = ai ?? container.resolve(SystemDesignAi);
  }

  private async getSessionAndRound(token: string): Promise<{ session: PortalSession; round: InterviewRound }> {
    const session = await this.portalRepository.findSessionByToken(token);
    if (!session) throw new HttpException(404, "Interview link not found or no longer valid");
    const round = session.rounds.find((r) => r.round_type === "system_design");
    if (!round) throw new HttpException(404, "No system_design round on this interview");
    return { session, round };
  }

  private async loadProblem(round: InterviewRound): Promise<{ context: ProblemContext; id: string; difficulty: QuestionDifficulty }> {
    if (!round.system_design_problem_id) throw new HttpException(404, "No problem has been assigned to this round");
    const problem = await this.repository.findProblemById(round.system_design_problem_id);
    if (!problem) throw new HttpException(404, "This round's problem no longer exists");
    const requirements = requirementsSchema.safeParse(problem.requirements);
    if (!requirements.success) throw new HttpException(500, "This round's problem has invalid requirements");
    return { id: problem.id, difficulty: problem.difficulty, context: { title: problem.title, prompt: problem.prompt, requirements: requirements.data } };
  }

  /** A round the candidate can still work in: started and not yet submitted. */
  private async getActiveRound(token: string) {
    const { round } = await this.getSessionAndRound(token);
    if (!round.started_at) throw new HttpException(400, "Start the round before using the board");
    if (round.status === "completed") throw new HttpException(409, "This round has already been submitted");
    const problem = await this.loadProblem(round);
    return { round, problem };
  }

  public async getRound(token: string): Promise<SystemDesignRoundView> {
    const { round } = await this.getSessionAndRound(token);
    const { id, difficulty, context } = await this.loadProblem(round);
    return {
      round_id: round.id,
      status: round.status,
      started_at: round.started_at ? round.started_at.toISOString() : null,
      duration_minutes: SYSTEM_DESIGN_ROUND_DURATION_MINUTES,
      problem: { id, title: context.title, prompt: context.prompt, difficulty, requirements: context.requirements },
      board: (round.board as unknown as Board | null) ?? EMPTY_BOARD,
      runs_used: round.simulation_runs,
      runs_max: MAX_AI_HINT_RUNS,
      ai_enabled: this.ai.isConfigured,
    };
  }

  /** Idempotent, like the DSA round: a refresh never resets the clock. */
  public async startRound(token: string): Promise<{ started_at: string }> {
    const { round } = await this.getSessionAndRound(token);
    if (round.started_at) return { started_at: round.started_at.toISOString() };
    const started = await this.portalRepository.startRound(round.id);
    return { started_at: started.started_at!.toISOString() };
  }

  public async saveBoard(token: string, board: Board): Promise<void> {
    const { round } = await this.getActiveRound(token);
    await this.repository.saveBoard(round.id, board);
  }

  /** Runs the deterministic engine, streams its result immediately, then (while the candidate has
   * hint runs left) adds the AI's explanation. The engine result never depends on the model. */
  public async simulate(token: string, board: Board, scenario: Scenario, emit: (event: SimulateEvent) => void, signal?: AbortSignal): Promise<void> {
    const { round, problem } = await this.getActiveRound(token);
    const result = simulate(board, problem.context.requirements, scenario);
    emit({ type: "engine", result });

    let runsUsed = round.simulation_runs;
    if (!this.ai.isConfigured) {
      emit({ type: "ai_skipped", reason: "not_configured" });
    } else if (!(await this.repository.reserveSimulationRun(round.id, MAX_AI_HINT_RUNS))) {
      emit({ type: "ai_skipped", reason: "limit_reached" });
    } else {
      runsUsed += 1;
      const hint = await this.safeHint(problem.context, board, result, signal);
      if (hint) {
        emit({ type: "ai_hint", hints: hint.hints, runs_used: runsUsed, runs_max: MAX_AI_HINT_RUNS });
      } else {
        // The model failed or the candidate left: don't charge them a hint run for nothing.
        await this.repository.releaseSimulationRun(round.id);
        runsUsed -= 1;
        emit({ type: "ai_skipped", reason: "unavailable" });
      }
    }
    emit({ type: "done", runs_used: runsUsed, runs_max: MAX_AI_HINT_RUNS });
  }

  private async safeHint(problem: ProblemContext, board: Board, result: SimulationResult, signal?: AbortSignal) {
    try {
      return await this.ai.hint(problem, board, result, signal);
    } catch (err) {
      if (!signal?.aborted) logger.error(`System design hint failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Final, one-shot: simulates every scenario, asks the model for a graded evaluation (best
   * effort) and stores everything for the hiring manager. The candidate never sees the evaluation. */
  public async submit(token: string, board: Board, emit: (event: SubmitEvent) => void): Promise<void> {
    const { round, problem } = await this.getActiveRound(token);

    emit({ type: "progress", stage: "simulating" });
    const engineResults = simulateAll(board, problem.context.requirements);

    let evaluation: EvaluationResult | null = null;
    let status: SystemDesignSubmission["evaluation_status"] = "skipped";
    if (this.ai.isConfigured && board.nodes.length > 0) {
      emit({ type: "progress", stage: "evaluating" });
      try {
        evaluation = await this.ai.evaluate(problem.context, board, engineResults);
      } catch (err) {
        logger.error(`System design evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      status = evaluation ? "ok" : "unavailable";
    }

    emit({ type: "progress", stage: "saving" });
    const submission: SystemDesignSubmission = { board, engine_results: engineResults, evaluation, evaluation_status: status, submitted_at: new Date().toISOString() };
    const saved = await this.repository.completeRound(round.id, submission as unknown as Record<string, unknown>, board);
    if (!saved) throw new HttpException(409, "This round has already been submitted");
    emit({ type: "done" });
  }
}
