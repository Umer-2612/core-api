import type { InterviewSession, SessionStatus } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateSessionData {
  candidate_id: string;
  job_id: string;
  invite_token: string;
  scheduled_at?: Date | null;
}

export interface UpdateSessionData {
  status?: SessionStatus;
  scheduled_at?: Date;
  started_at?: Date;
  completed_at?: Date;
}

export interface IInterviewSessionsRepository {
  findById(id: string): Promise<InterviewSession | null>;
  findByToken(token: string): Promise<InterviewSession | null>;
  findAllByCandidate(candidateId: string): Promise<InterviewSession[]>;
  create(data: CreateSessionData): Promise<InterviewSession>;
  update(id: string, data: UpdateSessionData): Promise<InterviewSession>;
}

/** Data access for the `interview_sessions` table (Prisma / Postgres). */
export class InterviewSessionsRepository implements IInterviewSessionsRepository {
  async findById(id: string): Promise<InterviewSession | null> {
    return prisma.interviewSession.findUnique({ where: { id } });
  }

  async findByToken(token: string): Promise<InterviewSession | null> {
    return prisma.interviewSession.findUnique({ where: { invite_token: token } });
  }

  async findAllByCandidate(candidateId: string): Promise<InterviewSession[]> {
    return prisma.interviewSession.findMany({
      where: { candidate_id: candidateId },
      orderBy: { created_at: "desc" },
    });
  }

  async create(data: CreateSessionData): Promise<InterviewSession> {
    return prisma.interviewSession.create({
      data: {
        candidate_id: data.candidate_id,
        job_id: data.job_id,
        invite_token: data.invite_token,
        scheduled_at: data.scheduled_at ?? null,
      },
    });
  }

  async update(id: string, data: UpdateSessionData): Promise<InterviewSession> {
    return prisma.interviewSession.update({ where: { id }, data });
  }
}
