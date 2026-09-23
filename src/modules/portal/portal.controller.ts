import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { SubmitDsaRoundDto } from "@modules/portal/portal.dto";
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

  public submitDsaRound: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const round = await this.portalService.submitDsaRound(req.params.token as string, req.body as SubmitDsaRoundDto);
    res.status(200).json({ data: round, message: "dsa round submitted" });
  });
}
