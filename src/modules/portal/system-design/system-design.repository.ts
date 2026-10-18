import { toJsonValue } from "@modules/candidates/candidate-profile.repository";
import type { Board } from "@modules/portal/system-design/types";
import type { InterviewRound, SystemDesignProblem } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface ISystemDesignRepository {
  findProblemById(id: string): Promise<SystemDesignProblem | null>;
  /** Sets `started_at` only if it is still unset and returns the winning start time either way. */
  startRoundOnce(roundId: string): Promise<Date>;
  saveBoard(roundId: string, board: Board): Promise<void>;
  /** Atomically takes one of the round's capped AI-hint runs. False when none are left. */
  reserveSimulationRun(roundId: string, cap: number): Promise<boolean>;
  /** Gives a reserved run back (the AI call failed or was cancelled). */
  releaseSimulationRun(roundId: string): Promise<void>;
  /** Writes the final submission and completes the round, only if it wasn't completed yet.
   * Returns null, writing nothing, when it already was. */
  completeRound(roundId: string, submission: Record<string, unknown>, board: Board): Promise<InterviewRound | null>;
}

/** Data access for the system design round: the problem bank lookup plus the round's board,
 * run counter and final submission. Session lookup and focus-loss logging stay in PortalRepository. */
export class SystemDesignRepository implements ISystemDesignRepository {
  async findProblemById(id: string): Promise<SystemDesignProblem | null> {
    return prisma.systemDesignProblem.findUnique({ where: { id } });
  }

  async startRoundOnce(roundId: string): Promise<Date> {
    await prisma.interviewRound.updateMany({ where: { id: roundId, started_at: null }, data: { started_at: new Date() } });
    const round = await prisma.interviewRound.findUniqueOrThrow({ where: { id: roundId }, select: { started_at: true } });
    return round.started_at!;
  }

  async saveBoard(roundId: string, board: Board): Promise<void> {
    await prisma.interviewRound.update({ where: { id: roundId }, data: { board: toJsonValue(board) } });
  }

  async reserveSimulationRun(roundId: string, cap: number): Promise<boolean> {
    const { count } = await prisma.interviewRound.updateMany({
      where: { id: roundId, simulation_runs: { lt: cap } },
      data: { simulation_runs: { increment: 1 } },
    });
    return count === 1;
  }

  async releaseSimulationRun(roundId: string): Promise<void> {
    await prisma.interviewRound.updateMany({ where: { id: roundId, simulation_runs: { gt: 0 } }, data: { simulation_runs: { decrement: 1 } } });
  }

  async completeRound(roundId: string, submission: Record<string, unknown>, board: Board): Promise<InterviewRound | null> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.interviewRound.updateMany({
        where: { id: roundId, status: { not: "completed" } },
        data: { status: "completed", submissions: toJsonValue(submission), board: toJsonValue(board) },
      });
      return count === 1 ? tx.interviewRound.findUniqueOrThrow({ where: { id: roundId } }) : null;
    });
  }
}
