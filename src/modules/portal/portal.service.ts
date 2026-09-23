import { container } from "tsyringe";
import type { SubmitDsaRoundDto } from "@modules/portal/portal.dto";
import type { IPortalRepository, PortalSession } from "@modules/portal/portal.repository";
import { PortalRepository } from "@modules/portal/portal.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type {
  InterviewRound,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewSessionStatus,
  QuestionDifficulty,
  RoundSubmission,
} from "@shared/interfaces/models.interface";

export interface PortalOverview {
  candidate_name: string;
  job_title: string;
  status: InterviewSessionStatus;
  rounds: { id: string; round_type: InterviewRoundType; sequence: number; status: InterviewRoundStatus }[];
}

export interface DsaRoundView {
  round: { id: string; status: InterviewRoundStatus; submission: RoundSubmission | null };
  question: {
    id: string;
    title: string;
    prompt: string;
    difficulty: QuestionDifficulty;
    tags: string[];
    starter_code: Record<string, string>;
  };
}

export class PortalService {
  private readonly portalRepository: IPortalRepository;

  constructor(portalRepository?: IPortalRepository) {
    this.portalRepository = portalRepository ?? container.resolve(PortalRepository);
  }

  private async getSessionOrThrow(token: string): Promise<PortalSession> {
    const session = await this.portalRepository.findSessionByToken(token);
    if (!session) throw new HttpException(404, "Interview link not found or no longer valid");
    return session;
  }

  private findRoundOrThrow(session: PortalSession, roundType: InterviewRoundType): InterviewRound {
    const round = session.rounds.find((r) => r.round_type === roundType);
    if (!round) throw new HttpException(404, `No ${roundType} round on this interview`);
    return round;
  }

  public async getPortal(token: string): Promise<PortalOverview> {
    const session = await this.getSessionOrThrow(token);
    return {
      candidate_name: session.candidate.full_name,
      job_title: session.job.title,
      status: session.status,
      rounds: session.rounds.map((r) => ({ id: r.id, round_type: r.round_type, sequence: r.sequence, status: r.status })),
    };
  }

  /** Assigns a random question the first time a candidate opens the round, then keeps
   * returning that same question on every later fetch (never reassigns). */
  public async getDsaRound(token: string): Promise<DsaRoundView> {
    const session = await this.getSessionOrThrow(token);
    const round = this.findRoundOrThrow(session, "dsa");

    let questionId = round.question_id;
    if (!questionId) {
      const picked = await this.portalRepository.findRandomQuestion();
      if (!picked) throw new HttpException(503, "No DSA questions are available yet");
      await this.portalRepository.assignQuestion(round.id, picked.id);
      questionId = picked.id;
    }

    const question = await this.portalRepository.findQuestionById(questionId);
    if (!question) throw new HttpException(404, "The assigned question no longer exists");

    return {
      round: { id: round.id, status: round.status, submission: (round.submission as RoundSubmission | null) ?? null },
      question: {
        id: question.id,
        title: question.title,
        prompt: question.prompt,
        difficulty: question.difficulty,
        tags: question.tags,
        starter_code: question.starter_code as Record<string, string>,
      },
    };
  }

  /** One-shot: 409s if this round was already submitted, matching the same
   * lock-it-in-once-done pattern as scheduling an interview. */
  public async submitDsaRound(token: string, data: SubmitDsaRoundDto): Promise<InterviewRound> {
    const session = await this.getSessionOrThrow(token);
    const round = this.findRoundOrThrow(session, "dsa");
    if (round.status === "completed") throw new HttpException(409, "This round has already been submitted");

    const submission: RoundSubmission = { code: data.code, language: data.language, submitted_at: new Date().toISOString() };
    return this.portalRepository.submitRound(round.id, submission);
  }
}
