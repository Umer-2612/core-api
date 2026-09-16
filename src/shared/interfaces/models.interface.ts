/**
 * Domain types. Prisma already generates clean plain objects that match these
 * shapes (unlike Mongoose, there's no lean()/ObjectId mapping needed), so we
 * re-export its types directly instead of hand-rolling duplicates.
 */
import type { Company, Invitation, User, UserRole } from "@prisma/client";

export type { Company, Invitation, User, UserRole };

/** Full user row, including the password hash. Never send this to a client. */
export type UserRecord = User;

/** Safe user shape: what we attach to requests and return in API responses. */
export interface PublicUser {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  role: UserRole;
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
  is_active: user.is_active,
  created_at: user.created_at,
});
