import { Router } from "express";
import { container, injectable } from "tsyringe";
import { runDsaTestsSchema, submitDsaQuestionSchema } from "@modules/portal/portal.dto";
import { PortalController } from "@modules/portal/portal.controller";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

/** No AuthMiddleware/requireRole anywhere here, deliberately: the candidate portal has no
 * login, the unguessable access_token in the URL is the only gate, same as the product spec. */
@injectable()
export class PortalRoute implements Routes {
  public router: Router = Router();
  public path = "/portal";
  private readonly portalController: PortalController;

  constructor() {
    this.portalController = container.resolve(PortalController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/:token", this.portalController.getPortal);
    this.router.get("/:token/dsa", this.portalController.getDsaRound);
    this.router.post("/:token/dsa/start", this.portalController.startDsaRound);
    this.router.post(
      "/:token/dsa/questions/:questionId/run-tests",
      ValidationMiddleware(runDsaTestsSchema),
      this.portalController.runDsaTests,
    );
    this.router.post(
      "/:token/dsa/questions/:questionId/submit",
      ValidationMiddleware(submitDsaQuestionSchema),
      this.portalController.submitDsaQuestion,
    );
  }
}
