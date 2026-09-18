import type { Prisma } from "@prisma/client";
import type { ParsedResumeExperience } from "@modules/candidates/resume-extractor";
import type { CandidateProfile } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateCandidateProfileData {
  candidate_id: string;
  phone: string | null;
  summary: string | null;
  skills: string[];
  experience: ParsedResumeExperience[];
}

export interface ICandidateProfileRepository {
  findByCandidateId(candidateId: string): Promise<CandidateProfile | null>;
  create(data: CreateCandidateProfileData): Promise<CandidateProfile>;
}

/** ParsedResumeExperience[] is plain data (strings and string arrays only), a valid JSON
 * value structurally, just not one TS can verify against Prisma's Json types without a
 * cast, since a named interface has no index signature. One shared helper instead of an
 * ad hoc cast at every call site that touches this field (repository, tests, anywhere else). */
export function experienceToJson(experience: ParsedResumeExperience[]): Prisma.InputJsonValue {
  return experience as unknown as Prisma.InputJsonValue;
}

/** Data access for the `candidate_profiles` table (Prisma / Postgres). What the resume
 * extractor pulled out beyond the name and email already on Candidate. */
export class CandidateProfileRepository implements ICandidateProfileRepository {
  async findByCandidateId(candidateId: string): Promise<CandidateProfile | null> {
    return prisma.candidateProfile.findUnique({ where: { candidate_id: candidateId } });
  }

  async create(data: CreateCandidateProfileData): Promise<CandidateProfile> {
    return prisma.candidateProfile.create({ data: { ...data, experience: experienceToJson(data.experience) } });
  }
}
