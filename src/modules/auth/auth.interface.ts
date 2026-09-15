import type { Request } from "express";
import type { PublicUser, UserRole } from "@shared/interfaces/models.interface";

export interface DataStoredInToken {
  id: string;
  companyId: string;
  role: UserRole;
}

export interface TokenData {
  token: string;
  expiresIn: number;
}

export interface RequestWithUser extends Request {
  user: PublicUser;
  cookies: { Authorization?: string };
}
