import type { Prisma } from "@prisma/client";
import type { Candidate, CandidateStatus, ParsedResume } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

/** ParsedResume is a plain object at runtime; Prisma just needs the JSON-value cast for its Json column type. */
const toJsonInput = (value: ParsedResume | null | undefined): Prisma.InputJsonValue | undefined =>
  value ? (value as unknown as Prisma.InputJsonValue) : undefined;

export interface CreateCandidateData {
  job_id: string;
  company_id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  resume_parsed?: ParsedResume | null;
}

export interface UpdateCandidateData {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  resume_parsed?: ParsedResume | null;
  status?: CandidateStatus;
}

export interface ICandidatesRepository {
  findById(id: string, companyId: string): Promise<Candidate | null>;
  /** Company-agnostic lookup. Only for public routes (e.g. resolving a session invite token) where auth hasn't scoped a company yet. */
  findByIdAny(id: string): Promise<Candidate | null>;
  findAllByJob(jobId: string, companyId: string): Promise<Candidate[]>;
  create(data: CreateCandidateData): Promise<Candidate>;
  update(id: string, companyId: string, data: UpdateCandidateData): Promise<Candidate>;
  delete(id: string, companyId: string): Promise<void>;
}

/** Data access for the `candidates` table (Prisma / Postgres). */
export class CandidatesRepository implements ICandidatesRepository {
  async findById(id: string, companyId: string): Promise<Candidate | null> {
    return prisma.candidate.findFirst({ where: { id, company_id: companyId } });
  }

  async findByIdAny(id: string): Promise<Candidate | null> {
    return prisma.candidate.findUnique({ where: { id } });
  }

  async findAllByJob(jobId: string, companyId: string): Promise<Candidate[]> {
    return prisma.candidate.findMany({
      where: { job_id: jobId, company_id: companyId },
      orderBy: { created_at: "desc" },
    });
  }

  async create(data: CreateCandidateData): Promise<Candidate> {
    return prisma.candidate.create({
      data: {
        job_id: data.job_id,
        company_id: data.company_id,
        full_name: data.full_name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        resume_parsed: toJsonInput(data.resume_parsed),
      },
    });
  }

  async update(id: string, companyId: string, data: UpdateCandidateData): Promise<Candidate> {
    const result = await prisma.candidate.updateMany({
      where: { id, company_id: companyId },
      data: { ...data, resume_parsed: toJsonInput(data.resume_parsed) },
    });
    if (result.count === 0) throw new Error(`Candidate not found: ${id}`);
    return prisma.candidate.findUniqueOrThrow({ where: { id } });
  }

  async delete(id: string, companyId: string): Promise<void> {
    await prisma.candidate.deleteMany({ where: { id, company_id: companyId } });
  }
}
