import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpException } from "@shared/exceptions/http.exception";

/** In-memory storage: resumes are small PDFs stored as bytes in Postgres, no
 * disk or object storage needed at this scale. */
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "application/pdf") {
      callback(new Error("Only PDF files are accepted"));
      return;
    }
    callback(null, true);
  },
});

/** multer/fileFilter errors are plain Errors, not HttpException, translate them
 * to a 400 here instead of letting them fall through to a generic 500. */
export const UploadResumes = (req: Request, res: Response, next: NextFunction) => {
  resumeUpload.array("resumes", 20)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) return next(new HttpException(400, err.message));
    if (err instanceof Error) return next(new HttpException(400, err.message));
    next();
  });
};
