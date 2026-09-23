import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RunDsaTestsDto, SubmitDsaQuestionDto } from "@modules/portal/portal.dto";
import { PortalService } from "@modules/portal/portal.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class PortalController {
  private readonly portalService: PortalService;

  constructor() {
    this.portalService = container.resolve(PortalService);
  }

  public getPortal: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const portal = await this.portalService.getPortal(req.params.token as string);
    res.status(200).json({ data: portal, message: "interview portal" });
  });

  public getDsaRound: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const round = await this.portalService.getDsaRound(req.params.token as string);
    res.status(200).json({ data: round, message: "dsa round" });
  });

  public startDsaRound: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.portalService.startDsaRound(req.params.token as string);
    res.status(200).json({ data: result, message: "dsa round started" });
  });

  public runDsaTests: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.portalService.runDsaTests(
      req.params.token as string,
      req.params.questionId as string,
      req.body as RunDsaTestsDto,
    );
    res.status(200).json({ data: result, message: "test run" });
  });

  public submitDsaQuestion: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const submission = await this.portalService.submitDsaQuestion(
      req.params.token as string,
      req.params.questionId as string,
      req.body as SubmitDsaQuestionDto,
    );
    res.status(200).json({ data: submission, message: "question submitted" });
  });
}
