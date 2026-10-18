import { Router } from "express";
import { container, injectable } from "tsyringe";
import { createProblemSchema, updateProblemSchema } from "@modules/system-design-problems/system-design-problems.dto";
import { SystemDesignProblemsController } from "@modules/system-design-problems/system-design-problems.controller";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

@injectable()
export class SystemDesignProblemsRoute implements Routes {
  public router: Router = Router();
  public path = "/system-design-problems";
  private readonly controller: SystemDesignProblemsController;

  constructor() {
    this.controller = container.resolve(SystemDesignProblemsController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/", AuthMiddleware, requireRole("super_admin", "hiring_manager"), this.controller.list);
    this.router.post("/", AuthMiddleware, requireRole("hiring_manager"), ValidationMiddleware(createProblemSchema), this.controller.create);
    this.router.get("/:id", AuthMiddleware, requireRole("super_admin", "hiring_manager"), this.controller.getById);
    this.router.patch("/:id", AuthMiddleware, requireRole("hiring_manager"), ValidationMiddleware(updateProblemSchema), this.controller.update);
    this.router.delete("/:id", AuthMiddleware, requireRole("hiring_manager"), this.controller.remove);
  }
}
