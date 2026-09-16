import type { NextFunction, Request, Response } from "express";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import { HttpException } from "@shared/exceptions/http.exception";
import type { UserRole } from "@shared/interfaces/models.interface";

/**
 * Role guard, use AFTER AuthMiddleware. Allows only the listed roles.
 *   router.post('/', AuthMiddleware, requireRole('super_admin'), handler)
 */
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as RequestWithUser).user;
    if (!user) return next(new HttpException(401, "Authentication required"));
    if (!roles.includes(user.role)) {
      return next(new HttpException(403, "You do not have permission to perform this action"));
    }
    next();
  };
