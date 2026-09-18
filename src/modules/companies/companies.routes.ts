import { Router } from "express";
import { container, injectable } from "tsyringe";
import { CompaniesController } from "@modules/companies/companies.controller";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

/** super_admin only: browsing every company and its users is platform-owner oversight,
 * not something a hiring manager needs. */
@injectable()
export class CompaniesRoute implements Routes {
  public router: Router = Router();
  public path = "/companies";
  private readonly companiesController: CompaniesController;

  constructor() {
    this.companiesController = container.resolve(CompaniesController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/", AuthMiddleware, requireRole("super_admin"), this.companiesController.list);
    this.router.get("/:id", AuthMiddleware, requireRole("super_admin"), this.companiesController.getById);
    this.router.get("/:id/users", AuthMiddleware, requireRole("super_admin"), this.companiesController.listUsers);
  }
}
