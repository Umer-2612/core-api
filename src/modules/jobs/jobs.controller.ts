import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { CreateJobDto } from "@modules/jobs/jobs.dto";
import { JobsService } from "@modules/jobs/jobs.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class JobsController {
  private readonly jobsService: JobsService;

  constructor() {
    this.jobsService = container.resolve(JobsService);
  }

  public create: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const job = await this.jobsService.create(req.body as CreateJobDto, user);
    res.status(201).json({ data: job, message: "job created" });
  });

  public list: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const jobs = await this.jobsService.list(user);
    res.status(200).json({ data: jobs, message: "jobs" });
  });

  public getById: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const job = await this.jobsService.getVisibleOrThrow(req.params.id as string, user);
    res.status(200).json({ data: job, message: "job" });
  });
}
