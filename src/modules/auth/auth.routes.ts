import { Router } from "express";
import { container, injectable } from "tsyringe";
import { AuthController } from "@modules/auth/auth.controller";
import { loginSchema, setPasswordSchema } from "@modules/auth/auth.dto";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

@injectable()
export class AuthRoute implements Routes {
  public router: Router = Router();
  public path = "/auth";
  private readonly authController: AuthController;

  constructor() {
    this.authController = container.resolve(AuthController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post("/login", ValidationMiddleware(loginSchema), this.authController.logIn);
    this.router.post("/set-password", ValidationMiddleware(setPasswordSchema), this.authController.setPassword);
    this.router.get("/me", AuthMiddleware, this.authController.me);
    this.router.post("/logout", this.authController.logOut);
    // DEV-ONLY. See AuthService.bootstrapAdmin's comment before touching this.
    this.router.post("/bootstrap-admin", this.authController.bootstrapAdmin);
  }
}
