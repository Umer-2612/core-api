import { container } from "tsyringe";
import { CandidatesService } from "@modules/candidates/candidates.service";
import type { ScheduleInterviewDto } from "@modules/interview-sessions/interview-sessions.dto";
import type { IInterviewSessionsRepository } from "@modules/interview-sessions/interview-sessions.repository";
import { InterviewSessionsRepository } from "@modules/interview-sessions/interview-sessions.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { InterviewSessionWithRounds, PublicUser } from "@shared/interfaces/models.interface";

export class InterviewSessionsService {
  private readonly interviewSessionsRepository: IInterviewSessionsRepository;
  private readonly candidatesService: CandidatesService;

  constructor(interviewSessionsRepository?: IInterviewSessionsRepository, candidatesService?: CandidatesService) {
    this.interviewSessionsRepository = interviewSessionsRepository ?? container.resolve(InterviewSessionsRepository);
    this.candidatesService = candidatesService ?? container.resolve(CandidatesService);
  }

  /** hiring_manager only (enforced at the route), the candidate must belong to this job,
   * which must belong to their own company. A candidate can only be scheduled once, so
   * this 409s if a session already exists rather than creating a second one. Creates the
   * session and its three rounds (dsa, vscode, technical_ai) together, atomically. */
  public async schedule(
    jobId: string,
    candidateId: string,
    data: ScheduleInterviewDto,
    scheduler: PublicUser,
  ): Promise<InterviewSessionWithRounds> {
    await this.candidatesService.getCandidateInJobOrThrow(jobId, candidateId, scheduler);

    const existing = await this.interviewSessionsRepository.findByCandidate(candidateId);
    if (existing.length > 0) throw new HttpException(409, "This candidate already has an interview scheduled");

    return this.interviewSessionsRepository.create({
      job_id: jobId,
      candidate_id: candidateId,
      scheduled_at: new Date(data.scheduled_at),
      created_by: scheduler.id,
    });
  }

  public async listByCandidate(jobId: string, candidateId: string, viewer: PublicUser): Promise<InterviewSessionWithRounds[]> {
    await this.candidatesService.getCandidateInJobOrThrow(jobId, candidateId, viewer);
    return this.interviewSessionsRepository.findByCandidate(candidateId);
  }
}
