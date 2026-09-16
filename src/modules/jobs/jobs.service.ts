import { container } from "tsyringe";
import type { CreateJobDto, UpdateJobDto } from "@modules/jobs/jobs.dto";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import type { IJobsRepository, JobWithCandidateCount } from "@modules/jobs/jobs.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { Job } from "@shared/interfaces/models.interface";

export class JobsService {
  private readonly jobsRepository: IJobsRepository;

  constructor(jobsRepository?: IJobsRepository) {
    this.jobsRepository = jobsRepository ?? container.resolve(JobsRepository);
  }

  async list(companyId: string): Promise<JobWithCandidateCount[]> {
    return this.jobsRepository.findAll(companyId);
  }

  async get(id: string, companyId: string): Promise<JobWithCandidateCount> {
    const job = await this.jobsRepository.findById(id, companyId);
    if (!job) throw new HttpException(404, "Job not found");
    return job;
  }

  async create(data: CreateJobDto, companyId: string, userId: string): Promise<Job> {
    return this.jobsRepository.create({
      company_id: companyId,
      created_by: userId,
      title: data.title,
      jd_raw_text: data.jd_raw_text ?? null,
    });
  }

  async update(id: string, companyId: string, data: UpdateJobDto): Promise<Job> {
    const existing = await this.jobsRepository.findById(id, companyId);
    if (!existing) throw new HttpException(404, "Job not found");
    if (existing.status === "done" && Object.keys(data).some((key) => key !== "status")) {
      throw new HttpException(400, "This job is done. Reopen it before changing job details.");
    }
    return this.jobsRepository.update(id, companyId, data);
  }

  async delete(id: string, companyId: string): Promise<void> {
    const existing = await this.jobsRepository.findById(id, companyId);
    if (!existing) throw new HttpException(404, "Job not found");
    await this.jobsRepository.delete(id, companyId);
  }
}
