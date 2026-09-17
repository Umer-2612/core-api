import type { NextFunction, Request, Response } from "express";
import { JsonWebTokenError, TokenExpiredError, verify } from "jsonwebtoken";
import { container } from "tsyringe";
import type { DataStoredInToken, RequestWithUser } from "@modules/auth/auth.interface";
import { UsersRepository } from "@modules/users/users.repository";
import { SECRET_KEY } from "@shared/config/env";
import { HttpException } from "@shared/exceptions/http.exception";
import { toPublicUser } from "@shared/interfaces/models.interface";

const getAuthorization = (req: Request): string | null => {
  const header = req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.replace("Bearer ", "").trim();

  const cookie = (req as RequestWithUser).cookies?.Authorization;
  if (cookie) return cookie;

  return null;
};

/**
 * Verifies the JWT (from the Authorization cookie or Bearer header), loads the
 * user, and attaches the safe `PublicUser` shape to `req.user`.
 */
export const AuthMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = getAuthorization(req);
    if (!token) return next(new HttpException(401, "Authentication token missing"));

    let payload: DataStoredInToken;
    try {
      payload = verify(token, SECRET_KEY) as DataStoredInToken;
    } catch (err) {
      if (err instanceof TokenExpiredError) return next(new HttpException(401, "Authentication token expired"));
      if (err instanceof JsonWebTokenError) return next(new HttpException(401, "Invalid authentication token"));
      return next(new HttpException(401, "Authentication failed"));
    }

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
