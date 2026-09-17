import { randomUUID } from "node:crypto";
import { container } from "tsyringe";
import type { ICandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesRepository } from "@modules/candidates/candidates.repository";
import type { IResumeStorage } from "@modules/candidates/resume-storage";
import { S3ResumeStorage } from "@modules/candidates/resume-storage";
import { JobsService } from "@modules/jobs/jobs.service";
import { HttpException } from "@shared/exceptions/http.exception";
import type { PublicCandidate, PublicUser } from "@shared/interfaces/models.interface";
import { toPublicCandidate } from "@shared/interfaces/models.interface";

export interface ResumeDownload {
  fileName: string;
  buffer: Buffer;
}

/** Turns "jane-doe_resume.pdf" into "Jane Doe Resume", there's no form field for this,
 * bulk upload is PDFs only, the filename is the only name we have. */
function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "");
  return base
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export class CandidatesService {
  private readonly candidatesRepository: ICandidatesRepository;
  private readonly jobsService: JobsService;
  private readonly resumeStorage: IResumeStorage;

  constructor(candidatesRepository?: ICandidatesRepository, jobsService?: JobsService, resumeStorage?: IResumeStorage) {
    this.candidatesRepository = candidatesRepository ?? container.resolve(CandidatesRepository);
    this.jobsService = jobsService ?? container.resolve(JobsService);
    this.resumeStorage = resumeStorage ?? container.resolve(S3ResumeStorage);
  }

  /** hiring_manager only (enforced at the route), the job must belong to their company. */
  public async uploadResumes(jobId: string, files: Express.Multer.File[], uploader: PublicUser): Promise<PublicCandidate[]> {
    await this.jobsService.getVisibleOrThrow(jobId, uploader);

    const candidates: PublicCandidate[] = [];
    for (const file of files) {
      const id = randomUUID();
      const key = `resumes/${jobId}/${id}-${file.originalname}`;
      await this.resumeStorage.upload(key, file.buffer, "application/pdf");

      const candidate = await this.candidatesRepository.create({
        id,
        job_id: jobId,
        full_name: nameFromFileName(file.originalname),
        resume_file_name: file.originalname,
        resume_key: key,
        created_by: uploader.id,
      });
      candidates.push(toPublicCandidate(candidate));
    }
    return candidates;
  }

  public async listByJob(jobId: string, viewer: PublicUser): Promise<PublicCandidate[]> {
    await this.jobsService.getVisibleOrThrow(jobId, viewer);
    const candidates = await this.candidatesRepository.findByJob(jobId);
    return candidates.map(toPublicCandidate);
  }

  public async getResumeOrThrow(jobId: string, candidateId: string, viewer: PublicUser): Promise<ResumeDownload> {
    await this.jobsService.getVisibleOrThrow(jobId, viewer);
    const candidate = await this.candidatesRepository.findById(candidateId);
    if (!candidate || candidate.job_id !== jobId) throw new HttpException(404, "Candidate not found");

    const buffer = await this.resumeStorage.download(candidate.resume_key);
    return { fileName: candidate.resume_file_name, buffer };
  }
}
