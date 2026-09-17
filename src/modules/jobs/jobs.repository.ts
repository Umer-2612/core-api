import type { Job } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateJobData {
  company_id: string;
  title: string;
  description: string;
  created_by: string;
}

export interface IJobsRepository {
  findById(id: string): Promise<Job | null>;
  findByCompany(companyId: string): Promise<Job[]>;
  findAll(): Promise<Job[]>;
  create(data: CreateJobData): Promise<Job>;
}

/** Data access for the `jobs` table (Prisma / Postgres). */
export class JobsRepository implements IJobsRepository {
  async findById(id: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { id } });
  }

  async findByCompany(companyId: string): Promise<Job[]> {
    return prisma.job.findMany({ where: { company_id: companyId }, orderBy: { created_at: "desc" } });
  }

  async findAll(): Promise<Job[]> {
    return prisma.job.findMany({ orderBy: { created_at: "desc" } });
  }

  async create(data: CreateJobData): Promise<Job> {
    return prisma.job.create({ data });
  }
}
