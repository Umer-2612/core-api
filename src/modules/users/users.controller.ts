import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RequestWithUser } from "@modules/auth/auth.interface";
import type { CreateUserDto } from "@modules/users/users.dto";
import { UsersService } from "@modules/users/users.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class UsersController {
  private readonly usersService: UsersService;

  constructor() {
    this.usersService = container.resolve(UsersService);
  }

  public create: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const created = await this.usersService.createUser(req.body as CreateUserDto, user);
    res.status(201).json({ data: created, message: "user created" });
  });

  public list: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as RequestWithUser;
    const users = await this.usersService.list(user);
    res.status(200).json({ data: users, message: "users" });
  });
}
