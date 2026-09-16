import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { CreateInvitationDto } from "@modules/invitations/invitations.dto";
import { InvitationsService } from "@modules/invitations/invitations.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class InvitationsController {
  private readonly invitationsService: InvitationsService;

  constructor() {
    this.invitationsService = container.resolve(InvitationsService);
  }

  public create: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const invitation = await this.invitationsService.invite(req.body as CreateInvitationDto, user);
    res.status(201).json({ data: invitation, message: "invitation sent" });
  });

  public list: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const invitations = await this.invitationsService.list(user);
    res.status(200).json({ data: invitations, message: "invitations" });
  });

  public resend: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    await this.invitationsService.resend(req.params.id as string, user);
    res.status(200).json({ data: null, message: "invitation resent" });
  });

  public cancel: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    await this.invitationsService.cancel(req.params.id as string);
    res.status(200).json({ data: null, message: "invitation cancelled" });
  });

  public getByToken: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const invitation = await this.invitationsService.getByToken(req.params.token as string);
    res.status(200).json({ data: invitation, message: "invitation" });
  });
}
