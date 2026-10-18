import type { NextFunction, Request, Response } from "express";
import { JsonWebTokenError, TokenExpiredError, verify } from "jsonwebtoken";
import { container } from "tsyringe";
import type { DataStoredInToken, RequestWithUser } from "@modules/auth/auth.interface";
import { UsersRepository } from "@modules/users/users.repository";
import { SECRET_KEY } from "@shared/config/env";
import { HttpException } from "@shared/exceptions/http.exception";
import { toPublicUser } from "@shared/interfaces/models.interface";

/** Bearer header first, then the cookie. Both are tried so a stale header can't mask a valid cookie. */
const getTokens = (req: Request): string[] => {
  const tokens: string[] = [];
  const header = req.header("Authorization");
  if (header?.startsWith("Bearer ")) tokens.push(header.replace("Bearer ", "").trim());

  const cookie = (req as RequestWithUser).cookies?.Authorization;
  if (cookie) tokens.push(cookie);

  return tokens;
};

/**
 * Verifies the JWT (from the Authorization cookie or Bearer header), loads the
 * user, and attaches the safe `PublicUser` shape to `req.user`.
 */
export const AuthMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const tokens = getTokens(req);
    if (tokens.length === 0) return next(new HttpException(401, "Authentication token missing"));

    let payload: DataStoredInToken | null = null;
    let failure: HttpException | null = null;
    for (const token of tokens) {
      try {
        payload = verify(token, SECRET_KEY) as DataStoredInToken;
        break;
      } catch (err) {
        failure ??=
          err instanceof TokenExpiredError
            ? new HttpException(401, "Authentication token expired")
            : err instanceof JsonWebTokenError
              ? new HttpException(401, "Invalid authentication token")
              : new HttpException(401, "Authentication failed");
      }
    }
    if (!payload) return next(failure ?? new HttpException(401, "Authentication failed"));

    const usersRepository = container.resolve(UsersRepository);
    const user = await usersRepository.findById(payload.id);
    if (!user) return next(new HttpException(401, "User not found for this token"));
    if (user.status !== "active") return next(new HttpException(403, "Your account is not active"));

    (req as RequestWithUser).user = toPublicUser(user);
    next();
  } catch {
    next(new HttpException(500, "Authentication middleware error"));
  }
};
