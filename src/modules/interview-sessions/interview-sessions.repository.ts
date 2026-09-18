import type { InterviewRoundType, InterviewSessionWithRounds } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateInterviewSessionData {
  job_id: string;
  candidate_id: string;
  scheduled_at: Date;
  created_by: string;
}

export interface IInterviewSessionsRepository {
  findById(id: string): Promise<InterviewSessionWithRounds | null>;
  findByCandidate(candidateId: string): Promise<InterviewSessionWithRounds[]>;
  create(data: CreateInterviewSessionData): Promise<InterviewSessionWithRounds>;
}

/** Every session gets these three rounds, in this order, no exceptions today. */
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
      const session = await tx.interviewSession.create({ data });
      await tx.interviewRound.createMany({
        data: ROUND_TYPES.map((round_type, index) => ({
          session_id: session.id,
          round_type,
          sequence: index + 1,
        })),
      });
      return tx.interviewSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { rounds: { orderBy: { sequence: "asc" } } },
      });
    });
  }
}
