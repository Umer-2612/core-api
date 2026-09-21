import type { Prisma } from "@prisma/client";
import type { ExtractedLink, ParsedResumeExperience, ResumeSection, SkillGroup } from "@modules/candidates/resume-extractor";
import type { CandidateProfile } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateCandidateProfileData {
  candidate_id: string;
  phone: string | null;
  summary: string | null;
  skills: SkillGroup[];
  experience: ParsedResumeExperience[];
  education: ParsedResumeExperience[];
  sections: ResumeSection[];
  links: ExtractedLink[];
}

export interface ICandidateProfileRepository {
  findByCandidateId(candidateId: string): Promise<CandidateProfile | null>;
  create(data: CreateCandidateProfileData): Promise<CandidateProfile>;
}

/** SkillGroup[]/ParsedResumeExperience[]/ResumeSection[] are plain data (strings and
 * arrays only), a valid JSON value structurally, just not one TS can verify against
 * Prisma's Json types without a cast, since a named interface has no index signature.
 * One shared helper instead of an ad hoc cast at every call site that touches these
 * fields (repository, tests, anywhere else). */
export function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** Data access for the `candidate_profiles` table (Prisma / Postgres). What the resume
 * extractor pulled out beyond the name and email already on Candidate. */
export class CandidateProfileRepository implements ICandidateProfileRepository {
  async findByCandidateId(candidateId: string): Promise<CandidateProfile | null> {
    return prisma.candidateProfile.findUnique({ where: { candidate_id: candidateId } });
  }

  async create(data: CreateCandidateProfileData): Promise<CandidateProfile> {
    return prisma.candidateProfile.create({
      data: {
        ...data,
        skills: toJsonValue(data.skills),
        experience: toJsonValue(data.experience),
        education: toJsonValue(data.education),
        sections: toJsonValue(data.sections),
        links: toJsonValue(data.links),
      },
    });
  }
}
