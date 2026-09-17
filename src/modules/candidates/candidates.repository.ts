import type { Candidate } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateCandidateData {
  id: string;
  job_id: string;
  full_name: string;
  resume_file_name: string;
  resume_key: string;
  created_by: string;
}

export interface ICandidatesRepository {
  findById(id: string): Promise<Candidate | null>;
  findByJob(jobId: string): Promise<Candidate[]>;
  create(data: CreateCandidateData): Promise<Candidate>;
}

/** Data access for the `candidates` table (Prisma / Postgres). The resume file itself lives
 * in S3, this table only stores its key (see resume-storage.ts). */
export class CandidatesRepository implements ICandidatesRepository {
  async findById(id: string): Promise<Candidate | null> {
    return prisma.candidate.findUnique({ where: { id } });
  }

  async findByJob(jobId: string): Promise<Candidate[]> {
    return prisma.candidate.findMany({ where: { job_id: jobId }, orderBy: { created_at: "desc" } });
  }

  async create(data: CreateCandidateData): Promise<Candidate> {
    return prisma.candidate.create({ data });
  }
}
