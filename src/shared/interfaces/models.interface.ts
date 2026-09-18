/**
 * Domain types. Prisma already generates clean plain objects that match these
 * shapes (unlike Mongoose, there's no lean()/ObjectId mapping needed), so we
 * re-export its types directly instead of hand-rolling duplicates.
 */
import type { Candidate, CandidateProfile, Company, Job, User, UserRole, UserStatus } from "@prisma/client";

export type { Candidate, CandidateProfile, Company, Job, User, UserRole, UserStatus };

/** Full user row, including the password hash. Never send this to a client. */
export type UserRecord = User;

/** Safe user shape: what we attach to requests and return in API responses. */
export interface PublicUser {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
}

/** Strip the password hash (and anything else sensitive) before returning a user. */
export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  company_id: user.company_id,
  full_name: user.full_name,
  email: user.email,
  role: user.role,
  status: user.status,
  created_at: user.created_at,
});

/** Candidate list/detail shape: never includes the resume bytes. */
export interface PublicCandidate {
  id: string;
  job_id: string;
  full_name: string;
  email: string | null;
  resume_file_name: string;
  created_at: Date;
}

export const toPublicCandidate = (candidate: Candidate): PublicCandidate => ({
  id: candidate.id,
  job_id: candidate.job_id,
  full_name: candidate.full_name,
  email: candidate.email,
  resume_file_name: candidate.resume_file_name,
  created_at: candidate.created_at,
});
