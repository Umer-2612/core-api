import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { CreateProblemDto, UpdateProblemDto } from "@modules/system-design-problems/system-design-problems.dto";
import { SystemDesignProblemsService } from "@modules/system-design-problems/system-design-problems.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class SystemDesignProblemsController {
  private readonly service: SystemDesignProblemsService;

  constructor() {
    this.service = container.resolve(SystemDesignProblemsService);
  }

  public create: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const problem = await this.service.create(req.body as CreateProblemDto, user);
    res.status(201).json({ data: problem, message: "system design problem created" });
  });

  public list: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    res.status(200).json({ data: await this.service.list(user), message: "system design problems" });
  });

  public getById: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    res.status(200).json({ data: await this.service.getVisibleOrThrow(req.params.id as string, user), message: "system design problem" });
  });

  public update: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const problem = await this.service.update(req.params.id as string, req.body as UpdateProblemDto, user);
    res.status(200).json({ data: problem, message: "system design problem updated" });
  });

  public remove: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    await this.service.remove(req.params.id as string, user);
    res.status(200).json({ data: null, message: "system design problem deleted" });
  });
}
