import { container } from "tsyringe";
import type { CreateJobDto } from "@modules/jobs/jobs.dto";
import type { IJobsRepository } from "@modules/jobs/jobs.repository";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { Job, PublicUser } from "@shared/interfaces/models.interface";

export class JobsService {
  private readonly jobsRepository: IJobsRepository;

  constructor(jobsRepository?: IJobsRepository) {
    this.jobsRepository = jobsRepository ?? container.resolve(JobsRepository);
  }

  /** hiring_manager only (enforced at the route), always scoped to their own company. */
  public async create(data: CreateJobDto, creator: PublicUser): Promise<Job> {
    return this.jobsRepository.create({
      company_id: creator.company_id,
      title: data.title,
      description: data.description,
      created_by: creator.id,
    });
  }

  /** super_admin sees every company's jobs; hiring_manager sees only their own. */
  public async list(viewer: PublicUser): Promise<Job[]> {
    return viewer.role === "super_admin"
      ? this.jobsRepository.findAll()
      : this.jobsRepository.findByCompany(viewer.company_id);
  }

  /** Throws 404 if the job doesn't exist, 403 if it exists but the viewer can't see it. */
  public async getVisibleOrThrow(id: string, viewer: PublicUser): Promise<Job> {
    const job = await this.jobsRepository.findById(id);
    if (!job) throw new HttpException(404, "Job not found");
    if (viewer.role !== "super_admin" && job.company_id !== viewer.company_id) {
      throw new HttpException(403, "You do not have permission to view this job");
    }
    return job;
  }
}
