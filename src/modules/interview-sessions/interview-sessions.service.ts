import { container } from "tsyringe";
import { CandidatesRepository } from "@modules/candidates/candidates.repository";
import type { ICandidatesRepository } from "@modules/candidates/candidates.repository";
import type { CreateSessionDto, UpdateSessionDto } from "@modules/interview-sessions/interview-sessions.dto";
import { InterviewSessionsRepository } from "@modules/interview-sessions/interview-sessions.repository";
import type { IInterviewSessionsRepository } from "@modules/interview-sessions/interview-sessions.repository";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import type { IJobsRepository } from "@modules/jobs/jobs.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { InterviewSession, SessionStatus } from "@shared/interfaces/models.interface";
import { generateSecureToken } from "@shared/utils/token";

export interface PublicSessionInvite {
  session_id: string;
  status: SessionStatus;
  candidate_name: string;
  job_title: string;
}

/**
 * Owns the interview session state machine:
 *   scheduled -> in_progress -> completed (see platform repo README, section 8)
 * `video-service` calls back into this via the session id/token to flip
 * status as the call actually starts/ends; this module doesn't touch LiveKit.
 */
export class InterviewSessionsService {
  private readonly sessionsRepository: IInterviewSessionsRepository;
  private readonly candidatesRepository: ICandidatesRepository;
  private readonly jobsRepository: IJobsRepository;

  constructor(
    sessionsRepository?: IInterviewSessionsRepository,
    candidatesRepository?: ICandidatesRepository,
    jobsRepository?: IJobsRepository,
  ) {
    this.sessionsRepository = sessionsRepository ?? container.resolve(InterviewSessionsRepository);
    this.candidatesRepository = candidatesRepository ?? container.resolve(CandidatesRepository);
    this.jobsRepository = jobsRepository ?? container.resolve(JobsRepository);
  }

  async listByCandidate(candidateId: string, companyId: string): Promise<InterviewSession[]> {
    await this.getCandidateOrThrow(candidateId, companyId);
    return this.sessionsRepository.findAllByCandidate(candidateId);
  }

  async create(candidateId: string, companyId: string, data: CreateSessionDto): Promise<InterviewSession> {
    const candidate = await this.getCandidateOrThrow(candidateId, companyId);
    const session = await this.sessionsRepository.create({
      candidate_id: candidate.id,
      job_id: candidate.job_id,
      invite_token: generateSecureToken(),
      scheduled_at: data.scheduled_at ?? null,
    });
    await this.candidatesRepository.update(candidate.id, companyId, { status: "scheduled" });
    return session;
  }

  async update(id: string, companyId: string, data: UpdateSessionDto): Promise<InterviewSession> {
    const session = await this.sessionsRepository.findById(id);
    if (!session) throw new HttpException(404, "Session not found");
    await this.getCandidateOrThrow(session.candidate_id, companyId);

    const patch: { status?: SessionStatus; scheduled_at?: Date; started_at?: Date; completed_at?: Date } = {
      status: data.status,
      scheduled_at: data.scheduled_at,
    };
    if (data.status === "in_progress" && !session.started_at) patch.started_at = new Date();
    if (data.status === "completed") patch.completed_at = new Date();

    return this.sessionsRepository.update(id, patch);
  }

  /**
   * Public: resolves an invite token for the candidate joining the room.
   * No auth on this route, the token itself is the access control, so lookups
   * here are intentionally company-agnostic (findByIdAny, not findById).
   */
  async getByToken(token: string): Promise<PublicSessionInvite> {
    const session = await this.sessionsRepository.findByToken(token);
    if (!session) throw new HttpException(404, "Invalid session link");

    const candidate = await this.candidatesRepository.findByIdAny(session.candidate_id);
    if (!candidate) throw new HttpException(404, "Candidate not found for this session");

    const job = await this.jobsRepository.findByIdAny(session.job_id);

    return {
      session_id: session.id,
      status: session.status,
      candidate_name: candidate.full_name,
      job_title: job?.title ?? "",
    };
  }

  private async getCandidateOrThrow(candidateId: string, companyId: string) {
    const candidate = await this.candidatesRepository.findById(candidateId, companyId);
    if (!candidate) throw new HttpException(404, "Candidate not found");
    return candidate;
  }
}
