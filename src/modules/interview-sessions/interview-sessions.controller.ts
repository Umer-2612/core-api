import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { ScheduleInterviewDto } from "@modules/interview-sessions/interview-sessions.dto";
import { InterviewSessionsService } from "@modules/interview-sessions/interview-sessions.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class InterviewSessionsController {
  private readonly interviewSessionsService: InterviewSessionsService;

  constructor() {
    this.interviewSessionsService = container.resolve(InterviewSessionsService);
  }

  public schedule: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const session = await this.interviewSessionsService.schedule(
      req.params.id as string,
      req.params.candidateId as string,
      req.body as ScheduleInterviewDto,
      user,
    );
    res.status(201).json({ data: session, message: "interview scheduled" });
  });

  public list: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const sessions = await this.interviewSessionsService.listByCandidate(
      req.params.id as string,
      req.params.candidateId as string,
      user,
    );
    res.status(200).json({ data: sessions, message: "interview sessions" });
  });
}
