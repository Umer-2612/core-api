import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { CreateSessionDto, UpdateSessionDto } from "@modules/interview-sessions/interview-sessions.dto";
import { InterviewSessionsService } from "@modules/interview-sessions/interview-sessions.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class InterviewSessionsController {
  private readonly sessionsService: InterviewSessionsService;

  constructor() {
    this.sessionsService = container.resolve(InterviewSessionsService);
  }

  public listByCandidate: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const sessions = await this.sessionsService.listByCandidate(req.params.candidateId as string, user.company_id);
    res.status(200).json({ data: sessions, message: "sessions" });
  });

  public create: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const session = await this.sessionsService.create(
      req.params.candidateId as string,
      user.company_id,
      req.body as CreateSessionDto,
    );
    res.status(201).json({ data: session, message: "session created" });
  });

  public update: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const session = await this.sessionsService.update(req.params.id as string, user.company_id, req.body as UpdateSessionDto);
    res.status(200).json({ data: session, message: "session updated" });
  });

  public getByToken: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const invite = await this.sessionsService.getByToken(req.params.token as string);
    res.status(200).json({ data: invite, message: "session invite" });
  });
}
