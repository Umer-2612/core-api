import { container } from "tsyringe";
import { DSA_ROUND_DURATION_MINUTES, JUDGE0_LANGUAGE_IDS, QUESTIONS_PER_DSA_ROUND } from "@modules/portal/dsa.constants";
import type { GradeResult } from "@modules/portal/grading";
import { gradeSubmission } from "@modules/portal/grading";
import type { IJudgeClient } from "@modules/portal/judge-client";
import { JudgeClient } from "@modules/portal/judge-client";
import type { RunDsaTestsDto, SubmitDsaQuestionDto } from "@modules/portal/portal.dto";
import type { IPortalRepository, PortalSession } from "@modules/portal/portal.repository";
import { PortalRepository } from "@modules/portal/portal.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type {
  InterviewRound,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewSessionStatus,
  QuestionDifficulty,
  QuestionSubmission,
  TestCase,
} from "@shared/interfaces/models.interface";

export interface PortalOverview {
  candidate_name: string;
  job_title: string;
  status: InterviewSessionStatus;
  rounds: { id: string; round_type: InterviewRoundType; sequence: number; status: InterviewRoundStatus }[];
}

export interface DsaQuestionView {
  id: string;
  title: string;
  prompt: string;
  difficulty: QuestionDifficulty;
  tags: string[];
  starter_code: Record<string, string>;
  /** Worked examples the candidate can see, never the locked ones. */
  open_test_cases: { input: string; expected_output: string }[];
  total_test_cases: number;
  submission: (QuestionSubmission & { question_id: string }) | null;
}

export interface DsaRoundView {
  round_id: string;
  status: InterviewRoundStatus;
  started_at: string | null;
  duration_minutes: number;
  questions: DsaQuestionView[];
}

export class PortalService {
  private readonly portalRepository: IPortalRepository;
  private readonly judgeClient: IJudgeClient;

  constructor(portalRepository?: IPortalRepository, judgeClient?: IJudgeClient) {
    this.portalRepository = portalRepository ?? container.resolve(PortalRepository);
    this.judgeClient = judgeClient ?? new JudgeClient();
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

  /** Assigns QUESTIONS_PER_DSA_ROUND random questions the first time a candidate opens
   * the round, then keeps returning the same ones on every later fetch (never reassigns). */
  public async getDsaRound(token: string): Promise<DsaRoundView> {
    const session = await this.getSessionOrThrow(token);
    const round = this.findRoundOrThrow(session, "dsa");

    let questionIds = round.question_ids;
    if (questionIds.length === 0) {
      const picked = await this.portalRepository.findRandomQuestions(QUESTIONS_PER_DSA_ROUND);
      if (picked.length === 0) throw new HttpException(503, "No DSA questions are available yet");
      questionIds = picked.map((q) => q.id);
      await this.portalRepository.assignQuestions(round.id, questionIds);
    }

    const questions = await this.portalRepository.findQuestionsByIds(questionIds);
    const submissions = (round.submissions as Record<string, QuestionSubmission> | null) ?? {};

    return {
      round_id: round.id,
      status: round.status,
      started_at: round.started_at ? round.started_at.toISOString() : null,
      duration_minutes: DSA_ROUND_DURATION_MINUTES,
      questions: questionIds.map((id) => {
        const question = questions.find((q) => q.id === id);
        if (!question) throw new HttpException(404, "One of this round's questions no longer exists");
        const testCases = question.test_cases as unknown as TestCase[];
        const submission = submissions[id] ?? null;
        return {
          id: question.id,
          title: question.title,
          prompt: question.prompt,
          difficulty: question.difficulty,
          tags: question.tags,
          starter_code: question.starter_code as Record<string, string>,
          open_test_cases: testCases.filter((tc) => !tc.locked).map((tc) => ({ input: tc.input, expected_output: tc.expected_output })),
          total_test_cases: testCases.length,
          submission: submission ? { ...submission, question_id: id } : null,
        };
      }),
    };
  }

  /** Idempotent: starts the round's timer the first time it's called, a later call
   * just returns the already-recorded start time unchanged, so refreshing the page
   * never resets the clock. */
  public async startDsaRound(token: string): Promise<{ started_at: string }> {
    const session = await this.getSessionOrThrow(token);
    const round = this.findRoundOrThrow(session, "dsa");

    if (round.started_at) return { started_at: round.started_at.toISOString() };

    const started = await this.portalRepository.startRound(round.id);
    return { started_at: started.started_at!.toISOString() };
  }

  private async getStartedRoundAndTestCases(
    token: string,
    questionId: string,
  ): Promise<{ round: InterviewRound; testCases: TestCase[] }> {
    const session = await this.getSessionOrThrow(token);
    const round = this.findRoundOrThrow(session, "dsa");

    if (!round.started_at) throw new HttpException(400, "Start the round before running or submitting code");
    if (!round.question_ids.includes(questionId)) throw new HttpException(404, "That question isn't part of this round");

    const [question] = await this.portalRepository.findQuestionsByIds([questionId]);
    if (!question) throw new HttpException(404, "The question no longer exists");

    return { round, testCases: question.test_cases as unknown as TestCase[] };
  }

  private resolveLanguageId(language: string): number {
    const languageId = JUDGE0_LANGUAGE_IDS[language];
    if (!languageId) throw new HttpException(400, `Unsupported language: ${language}`);
    return languageId;
  }

  /** A dry run against the question's test cases. Doesn't save anything, the candidate
   * can do this as many times as they like before submitting. */
  public async runDsaTests(token: string, questionId: string, data: RunDsaTestsDto): Promise<GradeResult> {
    const { testCases } = await this.getStartedRoundAndTestCases(token, questionId);
    const languageId = this.resolveLanguageId(data.language);
    return gradeSubmission(testCases, languageId, data.code, this.judgeClient);
  }

  /** One-shot per question: 409s if this question was already submitted. Once every
   * question in the round has a submission, the round itself flips to completed.
   * No server-side deadline enforcement yet, the client auto-submits at zero and this
   * trusts that rather than rejecting a late request and losing the candidate's code. */
  public async submitDsaQuestion(token: string, questionId: string, data: SubmitDsaQuestionDto): Promise<QuestionSubmission> {
    const { round, testCases } = await this.getStartedRoundAndTestCases(token, questionId);

    const submissions = (round.submissions as Record<string, QuestionSubmission> | null) ?? {};
    if (submissions[questionId]) throw new HttpException(409, "This question has already been submitted");

    const languageId = this.resolveLanguageId(data.language);
    const graded = await gradeSubmission(testCases, languageId, data.code, this.judgeClient);

    const submission: QuestionSubmission = {
      code: data.code,
      language: data.language,
      test_results: { passed: graded.passed, total: graded.total },
      submitted_at: new Date().toISOString(),
    };

    const nextSubmissions = { ...submissions, [questionId]: submission };
    const complete = round.question_ids.every((id) => Boolean(nextSubmissions[id]));

    await this.portalRepository.saveSubmission(round.id, nextSubmissions, complete);
    return submission;
  }
}
