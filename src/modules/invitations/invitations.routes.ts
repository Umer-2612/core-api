import { Router } from "express";
import { container, injectable } from "tsyringe";
import { InvitationsController } from "@modules/invitations/invitations.controller";
import { createInvitationSchema } from "@modules/invitations/invitations.dto";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

@injectable()
export class InvitationsRoute implements Routes {
  public router: Router = Router();
  public path = "/invitations";
  private readonly invitationsController: InvitationsController;

  constructor() {
    this.invitationsController = container.resolve(InvitationsController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/", AuthMiddleware, requireRole("super_admin", "hiring_manager"), this.invitationsController.list);
    this.router.post(
      "/",
      AuthMiddleware,
      requireRole("super_admin", "hiring_manager"),
      ValidationMiddleware(createInvitationSchema),
      this.invitationsController.create,
    );
    this.router.post("/:id/resend", AuthMiddleware, requireRole("super_admin"), this.invitationsController.resend);
    this.router.delete("/:id", AuthMiddleware, requireRole("super_admin"), this.invitationsController.cancel);
    this.router.get("/:token", this.invitationsController.getByToken);
  }
}
