/**
 * Domain types. Prisma already generates clean plain objects that match these
 * shapes (unlike Mongoose, there's no lean()/ObjectId mapping needed), so we
 * re-export its types directly instead of hand-rolling duplicates.
 */
import type {
  Candidate,
  CandidateStatus,
  Company,
  Invitation,
  InterviewSession,
  Job,
  JobStatus,
  SessionStatus,
  User,
  UserRole,
} from "@prisma/client";

export type {
  Candidate,
  CandidateStatus,
  Company,
  Invitation,
  InterviewSession,
  Job,
  JobStatus,
  SessionStatus,
  User,
  UserRole,
};

/** Full user row, including the password hash. Never send this to a client. */
export type UserRecord = User;

/** Safe user shape: what we attach to requests and return in API responses. */
export interface PublicUser {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: Date;
}

/** Strip the password hash (and anything else sensitive) before returning a user. */
export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  company_id: user.company_id,
  full_name: user.full_name,
  email: user.email,
  role: user.role,
  avatar_url: user.avatar_url,
  is_active: user.is_active,
  created_at: user.created_at,
});

/** Shape produced by resume-extractor.ts, stored as JSON on Candidate.resume_parsed. */
export interface ParsedResume {
  full_name: string;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: Array<{ company: string; role: string; years: string; bullets?: string[] }>;
  summary: string | null;
}
