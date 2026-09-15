import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { UpdateCandidateDto } from "@modules/candidates/candidates.dto";
import { CandidatesService } from "@modules/candidates/candidates.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class CandidatesController {
  private readonly candidatesService: CandidatesService;

  constructor() {
    this.candidatesService = container.resolve(CandidatesService);
  }

  public listByJob: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const candidates = await this.candidatesService.listByJob(req.params.jobId as string, user.company_id);
    res.status(200).json({ data: candidates, message: "candidates" });
  });

  public getById: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const candidate = await this.candidatesService.getById(req.params.candidateId as string, user.company_id);
    res.status(200).json({ data: candidate, message: "candidate" });
  });

  public create: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { message: "A resume file (PDF) is required" } });
      return;
    }
    const candidate = await this.candidatesService.create(req.params.jobId as string, user.company_id, {
      buffer: file.buffer,
      originalname: file.originalname,
    });
    res.status(201).json({ data: candidate, message: "candidate created" });
  });

  public update: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const candidate = await this.candidatesService.update(
      req.params.candidateId as string,
      user.company_id,
      req.body as UpdateCandidateDto,
    );
    res.status(200).json({ data: candidate, message: "candidate updated" });
  });

  public remove: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    await this.candidatesService.delete(req.params.candidateId as string, user.company_id);
    res.status(200).json({ data: null, message: "candidate deleted" });
  });
}
