import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import { CandidatesService } from "@modules/candidates/candidates.service";
import { HttpException } from "@shared/exceptions/http.exception";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class CandidatesController {
  private readonly candidatesService: CandidatesService;

  constructor() {
    this.candidatesService = container.resolve(CandidatesService);
  }

  public upload: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw new HttpException(400, "At least one PDF file is required");

    const candidates = await this.candidatesService.uploadResumes(req.params.id as string, files, user);
    res.status(201).json({ data: candidates, message: "resumes uploaded" });
  });

  public list: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const candidates = await this.candidatesService.listByJob(req.params.id as string, user);
    res.status(200).json({ data: candidates, message: "candidates" });
  });

  public downloadResume: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const resume = await this.candidatesService.getResumeOrThrow(
      req.params.id as string,
      req.params.candidateId as string,
      user,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${resume.fileName}"`);
    res.send(resume.buffer);
  });

  public getProfile: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const profile = await this.candidatesService.getProfileOrThrow(
      req.params.id as string,
      req.params.candidateId as string,
      user,
    );
    res.status(200).json({ data: profile, message: "candidate profile" });
  });
}
