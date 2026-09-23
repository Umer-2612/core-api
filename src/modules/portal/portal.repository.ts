import { toJsonValue } from "@modules/candidates/candidate-profile.repository";
import type { InterviewRound, InterviewSession, Question, RoundSubmission } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

/** A session as seen through the candidate portal: its rounds, plus just enough
 * candidate/job context to header the page, no company/creator internals. */
export type PortalSession = InterviewSession & {
  rounds: InterviewRound[];
  candidate: { full_name: string };
  job: { title: string };
};

export interface IPortalRepository {
  findSessionByToken(token: string): Promise<PortalSession | null>;
  findQuestionById(id: string): Promise<Question | null>;
  /** Picks one question at random from the whole pool. Null if the pool is empty. */
  findRandomQuestion(): Promise<Question | null>;
  assignQuestion(roundId: string, questionId: string): Promise<InterviewRound>;
  submitRound(roundId: string, submission: RoundSubmission): Promise<InterviewRound>;
}

/** Data access for the token-based candidate portal. Reads/writes `interview_sessions`,
 * `interview_rounds`, and `questions`, all keyed off the session's `access_token` rather
 * than an authenticated user, this is the one part of the API a candidate reaches directly. */
export class PortalRepository implements IPortalRepository {
  async findSessionByToken(token: string): Promise<PortalSession | null> {
    return prisma.interviewSession.findUnique({
      where: { access_token: token },
      include: {
        rounds: { orderBy: { sequence: "asc" } },
        candidate: { select: { full_name: true } },
        job: { select: { title: true } },
      },
    });
  }

  async findQuestionById(id: string): Promise<Question | null> {
    return prisma.question.findUnique({ where: { id } });
  }

  async findRandomQuestion(): Promise<Question | null> {
    const count = await prisma.question.count();
    if (count === 0) return null;
    const [question] = await prisma.question.findMany({ take: 1, skip: Math.floor(Math.random() * count) });
    return question ?? null;
  }

  async assignQuestion(roundId: string, questionId: string): Promise<InterviewRound> {
    return prisma.interviewRound.update({ where: { id: roundId }, data: { question_id: questionId } });
  }

  async submitRound(roundId: string, submission: RoundSubmission): Promise<InterviewRound> {
    return prisma.interviewRound.update({
      where: { id: roundId },
      data: { submission: toJsonValue(submission), status: "completed" },
    });
  }
}
