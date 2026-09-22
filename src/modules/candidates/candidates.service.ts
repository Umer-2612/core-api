import { randomUUID } from "node:crypto";
import { container } from "tsyringe";
import { CandidateProfileRepository } from "@modules/candidates/candidate-profile.repository";
import type { ICandidateProfileRepository } from "@modules/candidates/candidate-profile.repository";
import type { ICandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesRepository } from "@modules/candidates/candidates.repository";
import { extractResumeFromPdf, type ParsedResume } from "@modules/candidates/resume-extractor";
import type { IResumeStorage } from "@modules/candidates/resume-storage";
import { S3ResumeStorage } from "@modules/candidates/resume-storage";
import { JobsService } from "@modules/jobs/jobs.service";
import { HttpException } from "@shared/exceptions/http.exception";
import type { CandidateProfile, PublicCandidate, PublicUser } from "@shared/interfaces/models.interface";
import { toPublicCandidate } from "@shared/interfaces/models.interface";
import { logger } from "@shared/utils/logger";

export interface ResumeDownload {
  fileName: string;
  buffer: Buffer;
}

const EMPTY_PARSED_RESUME: ParsedResume = {
  full_name: "Unknown",
  email: null,
  phone: null,
  summary: null,
  skills: [],
  experience: [],
  education: [],
  sections: [],
  links: [],
};

/** Turns "jane-doe_resume.pdf" into "Jane Doe Resume", the fallback for when the PDF
 * couldn't be parsed at all, or the extractor couldn't find a name in it. */
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
  private readonly candidateProfileRepository: ICandidateProfileRepository;
  private readonly jobsService: JobsService;
  private readonly resumeStorage: IResumeStorage;

  constructor(
    candidatesRepository?: ICandidatesRepository,
    jobsService?: JobsService,
    resumeStorage?: IResumeStorage,
    candidateProfileRepository?: ICandidateProfileRepository,
  ) {
    this.candidatesRepository = candidatesRepository ?? container.resolve(CandidatesRepository);
    this.jobsService = jobsService ?? container.resolve(JobsService);
    this.resumeStorage = resumeStorage ?? container.resolve(S3ResumeStorage);
    this.candidateProfileRepository = candidateProfileRepository ?? container.resolve(CandidateProfileRepository);
  }

  /** hiring_manager only (enforced at the route), the job must belong to their company.
   * Each PDF is uploaded to S3, parsed for name/email/phone/skills/experience (best
   * effort, a parse failure never fails the upload), and stored as one Candidate plus
   * one CandidateProfile. */
  public async uploadResumes(jobId: string, files: Express.Multer.File[], uploader: PublicUser): Promise<PublicCandidate[]> {
    await this.jobsService.getVisibleOrThrow(jobId, uploader);

    const candidates: PublicCandidate[] = [];
    for (const file of files) {
      const id = randomUUID();
      const key = `resumes/${jobId}/${id}-${file.originalname}`;
      await this.resumeStorage.upload(key, file.buffer, "application/pdf");

      const parsed = await this.extractProfile(file.buffer, file.originalname);

      const candidate = await this.candidatesRepository.create({
        id,
        job_id: jobId,
        full_name: parsed.full_name !== "Unknown" ? parsed.full_name : nameFromFileName(file.originalname),
        email: parsed.email,
        resume_file_name: file.originalname,
        resume_key: key,
        created_by: uploader.id,
      });

      await this.candidateProfileRepository.create({
        candidate_id: id,
        phone: parsed.phone,
        summary: parsed.summary,
        skills: parsed.skills,
        experience: parsed.experience,
        education: parsed.education,
        sections: parsed.sections,
        links: parsed.links,
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

  public async getByIdOrThrow(jobId: string, candidateId: string, viewer: PublicUser): Promise<PublicCandidate> {
    const candidate = await this.getCandidateInJobOrThrow(jobId, candidateId, viewer);
    return toPublicCandidate(candidate);
  }

  public async getResumeOrThrow(jobId: string, candidateId: string, viewer: PublicUser): Promise<ResumeDownload> {
    const candidate = await this.getCandidateInJobOrThrow(jobId, candidateId, viewer);
    const buffer = await this.resumeStorage.download(candidate.resume_key);
    return { fileName: candidate.resume_file_name, buffer };
  }

  public async getProfileOrThrow(jobId: string, candidateId: string, viewer: PublicUser): Promise<CandidateProfile> {
    await this.getCandidateInJobOrThrow(jobId, candidateId, viewer);
    const profile = await this.candidateProfileRepository.findByCandidateId(candidateId);
    if (!profile) throw new HttpException(404, "Candidate profile not found");
    return profile;
  }

  /** Shared by InterviewSessionsService too: 404s if the candidate doesn't exist or
   * belongs to a different job, 403s if the viewer can't see this job at all. */
  public async getCandidateInJobOrThrow(jobId: string, candidateId: string, viewer: PublicUser) {
    await this.jobsService.getVisibleOrThrow(jobId, viewer);
    const candidate = await this.candidatesRepository.findById(candidateId);
    if (!candidate || candidate.job_id !== jobId) throw new HttpException(404, "Candidate not found");
    return candidate;
  }

  private async extractProfile(buffer: Buffer, originalname: string): Promise<ParsedResume> {
    try {
      return await extractResumeFromPdf(buffer);
    } catch (err) {
      logger.warn(`Resume extraction failed for "${originalname}": ${err instanceof Error ? err.message : String(err)}`);
      return EMPTY_PARSED_RESUME;
    }
  }
}
