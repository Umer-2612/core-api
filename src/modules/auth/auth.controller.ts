import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { LoginDto, SetPasswordDto } from "@modules/auth/auth.dto";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import { AuthService } from "@modules/auth/auth.service";
import { NODE_ENV } from "@shared/config/env";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class AuthController {
  private readonly authService: AuthService;

  constructor() {
    this.authService = container.resolve(AuthService);
  }

  public logIn: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const credentials = req.body as LoginDto;
    const { cookie, token, user } = await this.authService.login(credentials);
    res.setHeader("Set-Cookie", [cookie]);
    res.status(200).json({ data: { user, token }, message: "login" });
  });

  public setPassword: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body as SetPasswordDto;
    const { cookie, token, user } = await this.authService.setPassword(payload);
    res.setHeader("Set-Cookie", [cookie]);
    res.status(201).json({ data: { user, token }, message: "password set" });
  });

  /** DEV-ONLY. See AuthService.bootstrapAdmin's comment before touching this. */
  public bootstrapAdmin: RequestHandler = asyncHandler(async (_req: Request, res: Response) => {
    const { cookie, token, user } = await this.authService.bootstrapAdmin();
    res.setHeader("Set-Cookie", [cookie]);
    res.status(201).json({ data: { user, token }, message: "super admin created" });
  });

  public me: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const fresh = await this.authService.me(user.id);
    res.status(200).json({ data: fresh, message: "me" });
  });

  public logOut: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const user = (req as Partial<RequestWithUser>).user;
    if (user) await this.authService.logout(user);

    res.clearCookie("Authorization", {
      httpOnly: true,
      path: "/",
      sameSite: NODE_ENV === "production" ? "none" : "lax",
      secure: NODE_ENV === "production",
    });
    res.status(200).json({ message: "logout" });
  });
}
