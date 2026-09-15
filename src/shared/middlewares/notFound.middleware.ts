import type { NextFunction, Request, Response } from "express";
import { HttpException } from "@shared/exceptions/http.exception";

export const NotFoundMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  next(new HttpException(404, `Route not found: ${req.method} ${req.originalUrl}`));
};
