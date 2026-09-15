import { container } from "tsyringe";
import { CandidatesRepository } from "@modules/candidates/candidates.repository";
import type { ICandidatesRepository } from "@modules/candidates/candidates.repository";
import type { UpdateCandidateDto } from "@modules/candidates/candidates.dto";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import type { IJobsRepository } from "@modules/jobs/jobs.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { Candidate, Job } from "@shared/interfaces/models.interface";
import { extractResumeFromPdf } from "@shared/utils/resume-extractor";
import { logger } from "@shared/utils/logger";

export interface UploadedResume {
  buffer: Buffer;
  originalname: string;
}

export class CandidatesService {
  private readonly candidatesRepository: ICandidatesRepository;
  private readonly jobsRepository: IJobsRepository;

  constructor(candidatesRepository?: ICandidatesRepository, jobsRepository?: IJobsRepository) {
    this.candidatesRepository = candidatesRepository ?? container.resolve(CandidatesRepository);
    this.jobsRepository = jobsRepository ?? container.resolve(JobsRepository);
  }

  async listByJob(jobId: string, companyId: string): Promise<Candidate[]> {
    return this.candidatesRepository.findAllByJob(jobId, companyId);
  }

  async getById(id: string, companyId: string): Promise<Candidate> {
    const candidate = await this.candidatesRepository.findById(id, companyId);
    if (!candidate) throw new HttpException(404, "Candidate not found");
    return candidate;
  }

  /**
   * Creates a candidate for a job. If a resume PDF is provided, it's parsed
   * in-memory (see resume-extractor.ts) and the structured result stored on
   * the candidate. The raw file itself isn't persisted yet — that's a follow-up
   * once file storage (R2/S3) is wired into this service.
   */
  async create(jobId: string, companyId: string, resume?: UploadedResume): Promise<Candidate> {
    const job = await this.jobsRepository.findById(jobId, companyId);
    if (!job) throw new HttpException(404, "Job not found");
    this.assertJobOpen(job, "adding a candidate");

    if (!resume) {
      throw new HttpException(400, "A resume file (PDF) is required");
    }

    const parsed = await this.extractProfile(resume.buffer);
    const nameFromFile = resume.originalname.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();

    return this.candidatesRepository.create({
      job_id: jobId,
      company_id: companyId,
      full_name: parsed.full_name !== "Unknown" ? parsed.full_name : nameFromFile || "Candidate",
      email: parsed.email,
      phone: parsed.phone,
      resume_parsed: parsed,
    });
  }

  async update(id: string, companyId: string, data: UpdateCandidateDto): Promise<Candidate> {
    const existing = await this.candidatesRepository.findById(id, companyId);
    if (!existing) throw new HttpException(404, "Candidate not found");
    return this.candidatesRepository.update(id, companyId, data);
  }

  async delete(id: string, companyId: string): Promise<void> {
    const existing = await this.candidatesRepository.findById(id, companyId);
    if (!existing) throw new HttpException(404, "Candidate not found");
    await this.candidatesRepository.delete(id, companyId);
  }

  private async extractProfile(buffer: Buffer) {
    try {
      return await extractResumeFromPdf(buffer);
    } catch (err) {
      logger.warn(`PDF resume extraction failed: ${String(err)}`);
      return { full_name: "Unknown", email: null, phone: null, summary: null, skills: [], experience: [] };
    }
  }

  private assertJobOpen(job: Job, action: string): void {
    if (job.status === "done") {
      throw new HttpException(400, `This job is done. Reopen it before ${action}.`);
    }
  }
}
