import { toJsonValue } from "@modules/candidates/candidate-profile.repository";
import type { FocusLossEvent, InterviewRound, InterviewSession, Question, QuestionSubmission } from "@shared/interfaces/models.interface";
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
  findQuestionsByIds(ids: string[]): Promise<Question[]>;
  /** Picks `count` distinct questions at random from the whole pool. Fewer than
   * `count` if the pool itself is smaller than that. */
  findRandomQuestions(count: number): Promise<Question[]>;
  assignQuestions(roundId: string, questionIds: string[]): Promise<InterviewRound>;
  /** Idempotent at the service layer, not here: this always overwrites started_at,
   * callers only invoke it once they've confirmed the round hasn't started yet. */
  startRound(roundId: string): Promise<InterviewRound>;
  /** Atomically records one question's submission against the round's current
   * submissions (locking the row, so concurrent submits can't overwrite each other) and
   * flips the round to completed once every assigned question has one. Returns null,
   * writing nothing, if that question was already submitted. */
  addSubmission(roundId: string, questionId: string, submission: QuestionSubmission): Promise<InterviewRound | null>;
  saveFocusLossEvents(roundId: string, events: FocusLossEvent[]): Promise<InterviewRound>;
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

  async findQuestionsByIds(ids: string[]): Promise<Question[]> {
    return prisma.question.findMany({ where: { id: { in: ids } } });
  }

  async findRandomQuestions(count: number): Promise<Question[]> {
    const all = await prisma.question.findMany();
    if (all.length <= count) return all;
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  async assignQuestions(roundId: string, questionIds: string[]): Promise<InterviewRound> {
    return prisma.interviewRound.update({ where: { id: roundId }, data: { question_ids: questionIds } });
  }

  async startRound(roundId: string): Promise<InterviewRound> {
    return prisma.interviewRound.update({ where: { id: roundId }, data: { started_at: new Date() } });
  }

  async addSubmission(roundId: string, questionId: string, submission: QuestionSubmission): Promise<InterviewRound | null> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM interview_rounds WHERE id = ${roundId} FOR UPDATE`;
      const round = await tx.interviewRound.findUniqueOrThrow({ where: { id: roundId } });

      const existing = (round.submissions as Record<string, QuestionSubmission> | null) ?? {};
      if (existing[questionId]) return null;

      const next = { ...existing, [questionId]: submission };
      const complete = round.question_ids.every((id) => Boolean(next[id]));
      return tx.interviewRound.update({
        where: { id: roundId },
        data: { submissions: toJsonValue(next), status: complete ? "completed" : undefined },
      });
    });
  }

  async saveFocusLossEvents(roundId: string, events: FocusLossEvent[]): Promise<InterviewRound> {
    return prisma.interviewRound.update({
      where: { id: roundId },
      data: { focus_loss_events: toJsonValue(events) },
    });
  }
}
