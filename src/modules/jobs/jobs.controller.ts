import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { CreateJobDto, UpdateJobDto } from "@modules/jobs/jobs.dto";
import { JobsService } from "@modules/jobs/jobs.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class JobsController {
  private readonly jobsService: JobsService;

  constructor() {
    this.jobsService = container.resolve(JobsService);
  }

  public list: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const jobs = await this.jobsService.list(user.company_id);
    res.status(200).json({ data: jobs, message: "jobs" });
  });

  public get: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const job = await this.jobsService.get(req.params.id as string, user.company_id);
    res.status(200).json({ data: job, message: "job" });
  });

  public create: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const job = await this.jobsService.create(req.body as CreateJobDto, user.company_id, user.id);
    res.status(201).json({ data: job, message: "job created" });
  });

  public update: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    const job = await this.jobsService.update(req.params.id as string, user.company_id, req.body as UpdateJobDto);
    res.status(200).json({ data: job, message: "job updated" });
  });

  public remove: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as RequestWithUser).user;
    await this.jobsService.delete(req.params.id as string, user.company_id);
    res.status(200).json({ data: null, message: "job deleted" });
  });
}
