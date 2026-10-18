import type { InterviewRoundType, InterviewSessionWithRounds } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateInterviewSessionData {
  job_id: string;
  candidate_id: string;
  scheduled_at: Date;
  created_by: string;
  /** When set, the session also gets a fourth `system_design` round with this problem assigned. */
  system_design_problem_id?: string;
}

export interface IInterviewSessionsRepository {
  findById(id: string): Promise<InterviewSessionWithRounds | null>;
  findByCandidate(candidateId: string): Promise<InterviewSessionWithRounds[]>;
  create(data: CreateInterviewSessionData): Promise<InterviewSessionWithRounds>;
}

/** Every session gets these three rounds, in this order. A `system_design` round is appended
 * as a fourth only when the hiring manager picked a problem for it. */
const ROUND_TYPES: InterviewRoundType[] = ["dsa", "vscode", "technical_ai"];

/** Data access for the `interview_sessions` / `interview_rounds` tables (Prisma / Postgres).
 * A session and its rounds are always created together, so this repository owns both tables
 * rather than splitting them the way Company/User's createWithUser already does. */
export class InterviewSessionsRepository implements IInterviewSessionsRepository {
  async findById(id: string): Promise<InterviewSessionWithRounds | null> {
    return prisma.interviewSession.findUnique({ where: { id }, include: { rounds: { orderBy: { sequence: "asc" } } } });
  }

  async findByCandidate(candidateId: string): Promise<InterviewSessionWithRounds[]> {
    return prisma.interviewSession.findMany({
      where: { candidate_id: candidateId },
      include: { rounds: { orderBy: { sequence: "asc" } } },
      orderBy: { scheduled_at: "desc" },
    });
  }

  async create(data: CreateInterviewSessionData): Promise<InterviewSessionWithRounds> {
    return prisma.$transaction(async (tx) => {
      const { system_design_problem_id, ...sessionData } = data;
      const session = await tx.interviewSession.create({ data: sessionData });
      const roundTypes: InterviewRoundType[] = system_design_problem_id ? [...ROUND_TYPES, "system_design"] : ROUND_TYPES;
      await tx.interviewRound.createMany({
        data: roundTypes.map((round_type, index) => ({
          session_id: session.id,
          round_type,
          sequence: index + 1,
          ...(round_type === "system_design" ? { system_design_problem_id } : {}),
        })),
      });
      return tx.interviewSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { rounds: { orderBy: { sequence: "asc" } } },
      });
    });
  }
}
