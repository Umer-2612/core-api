import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { HttpException } from "@shared/exceptions/http.exception";

export function ValidationMiddleware(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Express 5: body may be null/undefined if no JSON was parsed.
    if (req.body === null || req.body === undefined) {
      return next(new HttpException(400, "Request body is required"));
    }

    // No blanket "empty object is invalid" check here: an all-optional schema
    // (e.g. createSessionSchema) makes `{}` a legitimate body. Zod below is
    // already the source of truth for what's required per route.
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join(", ");
      return next(new HttpException(400, message));
    }
    req.body = result.data;
    next();
  };
}
