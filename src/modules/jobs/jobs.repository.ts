import type { Job, JobStatus } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateJobData {
  company_id: string;
  created_by: string;
  title: string;
  jd_raw_text?: string | null;
}

export interface UpdateJobData {
  title?: string;
  jd_raw_text?: string | null;
  status?: JobStatus;
}

export interface JobWithCandidateCount extends Job {
  candidate_count: number;
}

export interface IJobsRepository {
  findById(id: string, companyId: string): Promise<JobWithCandidateCount | null>;
  /** Company-agnostic lookup, for public routes only (e.g. resolving a session invite token). */
  findByIdAny(id: string): Promise<Job | null>;
  findAll(companyId: string): Promise<JobWithCandidateCount[]>;
  create(data: CreateJobData): Promise<Job>;
  update(id: string, companyId: string, data: UpdateJobData): Promise<Job>;
  delete(id: string, companyId: string): Promise<void>;
}

/** Data access for the `jobs` table (Prisma / Postgres). */
export class JobsRepository implements IJobsRepository {
  async findById(id: string, companyId: string): Promise<JobWithCandidateCount | null> {
    const job = await prisma.job.findFirst({
      where: { id, company_id: companyId },
      include: { _count: { select: { candidates: true } } },
    });
    if (!job) return null;
    const { _count, ...rest } = job;
    return { ...rest, candidate_count: _count.candidates };
  }

  async findByIdAny(id: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { id } });
  }

  async findAll(companyId: string): Promise<JobWithCandidateCount[]> {
    const jobs = await prisma.job.findMany({
      where: { company_id: companyId },
      include: { _count: { select: { candidates: true } } },
      orderBy: { created_at: "desc" },
    });
    return jobs.map(({ _count, ...rest }) => ({ ...rest, candidate_count: _count.candidates }));
  }

  async create(data: CreateJobData): Promise<Job> {
    return prisma.job.create({
      data: {
        company_id: data.company_id,
        created_by: data.created_by,
        title: data.title,
        jd_raw_text: data.jd_raw_text ?? null,
      },
    });
  }

  async update(id: string, companyId: string, data: UpdateJobData): Promise<Job> {
    const result = await prisma.job.updateMany({ where: { id, company_id: companyId }, data });
    if (result.count === 0) throw new Error(`Job not found: ${id}`);
    return prisma.job.findUniqueOrThrow({ where: { id } });
  }

  async delete(id: string, companyId: string): Promise<void> {
    await prisma.job.deleteMany({ where: { id, company_id: companyId } });
  }
}
