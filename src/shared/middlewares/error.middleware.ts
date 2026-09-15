import type { NextFunction, Request, Response } from "express";
import type { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { ZodError } from "zod";
import { NODE_ENV } from "@shared/config/env";
import { HttpException } from "@shared/exceptions/http.exception";
import {
  HTTP_ERROR_MESSAGES,
  type StandardErrorResponse,
  type ValidationErrorDetail,
} from "@shared/interfaces/error.interface";
import { logger } from "@shared/utils/logger";

type HttpExceptionWithData = HttpException & { data?: unknown };
type WithStack = { stack?: string };

const isZodError = (e: unknown): e is ZodError => e instanceof ZodError;

// jsonwebtoken classes can cross realm boundaries, so guard by error name.
const isTokenExpiredError = (e: unknown): e is TokenExpiredError =>
  e instanceof Error && (e as { name?: string }).name === "TokenExpiredError";
const isJsonWebTokenError = (e: unknown): e is JsonWebTokenError =>
  e instanceof Error && (e as { name?: string }).name === "JsonWebTokenError";

const toHttpException = (err: unknown): HttpException => {
  if (err instanceof HttpException) return err;

  if (isZodError(err)) {
    const details: ValidationErrorDetail[] = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return new HttpException(400, "Validation failed", details);
  }

  if (isTokenExpiredError(err)) return new HttpException(401, "Token expired");
  if (isJsonWebTokenError(err)) return new HttpException(401, "Invalid token");

  const e = err as Error | undefined;
  return new HttpException(500, e?.message || "Internal server error");
};

const extractStack = (err: unknown): string | undefined => {
  if (err && typeof err === "object" && "stack" in err) {
    const s = (err as WithStack).stack;
    return typeof s === "string" ? s : undefined;
  }
  return undefined;
};

export const ErrorMiddleware = (error: unknown, req: Request, res: Response, next: NextFunction) => {
  const httpErr = toHttpException(error);
  const status = httpErr.status || 500;
  const message =
    httpErr.message || HTTP_ERROR_MESSAGES[status] || "Something went wrong";

  if (res.headersSent) return next(httpErr);

  const stack = extractStack(httpErr);
  logger.error(`[${req.method}] ${req.originalUrl} | ${status} | ${message}${stack ? `\n${stack}` : ""}`);

  const errorResponse: StandardErrorResponse = {
    success: false,
    error: { code: status, message, timestamp: new Date().toISOString(), path: req.originalUrl },
  };

  const maybeDetails = (httpErr as HttpExceptionWithData).data;
  if (typeof maybeDetails !== "undefined") errorResponse.error.details = maybeDetails;

  if (NODE_ENV === "development" && stack) {
    errorResponse.error.details = { ...(errorResponse.error.details as object), stack };
  }

  res.status(status).json(errorResponse);
};
