import { Router } from "express";
import { container, injectable } from "tsyringe";
import { UsersController } from "@modules/users/users.controller";
import { createUserSchema } from "@modules/users/users.dto";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

@injectable()
export class UsersRoute implements Routes {
  public router: Router = Router();
  public path = "/users";
  private readonly usersController: UsersController;

  constructor() {
    this.usersController = container.resolve(UsersController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/", AuthMiddleware, requireRole("super_admin", "hiring_manager"), this.usersController.list);
    this.router.post(
      "/",
      AuthMiddleware,
      requireRole("super_admin", "hiring_manager"),
      ValidationMiddleware(createUserSchema),
      this.usersController.create,
    );
  }
}
