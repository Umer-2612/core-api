import { sign } from "jsonwebtoken";
import { container } from "tsyringe";
import type { DataStoredInToken, TokenData } from "@modules/auth/auth.interface";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import type { ICompaniesRepository } from "@modules/companies/companies.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import { UsersRepository } from "@modules/users/users.repository";
import {
  JWT_EXPIRES_IN_SECONDS,
  NODE_ENV,
  SECRET_KEY,
  SUPER_ADMIN_COMPANY_NAME,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_PASSWORD,
} from "@shared/config/env";
import { HttpException } from "@shared/exceptions/http.exception";
import { type PublicUser, toPublicUser, type UserRecord } from "@shared/interfaces/models.interface";
import { Hash } from "@shared/utils/hash";
import { logger } from "@shared/utils/logger";

export class AuthService {
  private readonly usersRepository: IUsersRepository;
  private readonly companiesRepository: ICompaniesRepository;

  constructor(usersRepository?: IUsersRepository, companiesRepository?: ICompaniesRepository) {
    this.usersRepository = usersRepository ?? container.resolve(UsersRepository);
    this.companiesRepository = companiesRepository ?? container.resolve(CompaniesRepository);
  }

  // --- Token / cookie helpers ---------------------------------------------

  private createToken(user: UserRecord | PublicUser): TokenData {
    const payload: DataStoredInToken = { id: user.id, companyId: user.company_id, role: user.role };
    const expiresIn = JWT_EXPIRES_IN_SECONDS;
    const token = sign(payload, SECRET_KEY, { expiresIn });
    return { expiresIn, token };
  }

  private createCookie(tokenData: TokenData): string {
    const sameSite = NODE_ENV === "production" ? "None" : "Lax";
    return `Authorization=${tokenData.token}; HttpOnly; Max-Age=${tokenData.expiresIn}; Path=/; SameSite=${sameSite};${
      NODE_ENV === "production" ? " Secure;" : ""
    }`;
  }

  // --- Use cases -----------------------------------------------------------

  /** Email + password login. Returns the auth cookie and the safe user shape. */
  public async login(credentials: {
    email: string;
    password: string;
  }): Promise<{ cookie: string; token: string; user: PublicUser }> {
    const user = await this.usersRepository.findByEmail(credentials.email);
    if (!user) throw new HttpException(401, "Invalid email or password");

    const matches = await Hash.comparePassword(credentials.password, user.password_hash);
    if (!matches) throw new HttpException(401, "Invalid email or password");

    const tokenData = this.createToken(user);
    return { cookie: this.createCookie(tokenData), token: tokenData.token, user: toPublicUser(user) };
  }

  /** Returns the currently authenticated user. */
  public async me(userId: string): Promise<PublicUser> {
    const user = await this.usersRepository.findById(userId);
    if (!user) throw new HttpException(404, "User not found");
    return toPublicUser(user);
  }

  public async logout(user: PublicUser): Promise<void> {
    // Stateless JWT, clearing the client cookie is enough. Hook in a token
    // blacklist / refresh-token revocation here if needed later.
    logger.info(`User ${user.email} logged out.`);
  }

  /**
   * DEV-ONLY, self-service alternative to `npm run seed:admin`. Creates the
   * platform's one super_admin from the SUPER_ADMIN_* env vars, over HTTP
   * instead of a CLI script. Disabled outside development and refuses to run
   * if a super_admin already exists, an unauthenticated account-creation
   * endpoint is real attack surface; remove this method and its route once
   * it's no longer needed for convenience during early setup.
   */
  public async bootstrapAdmin(): Promise<{ cookie: string; token: string; user: PublicUser }> {
    if (NODE_ENV === "production") {
      throw new HttpException(403, "Not available in production");
    }
    if (await this.usersRepository.existsByRole("super_admin")) {
      throw new HttpException(409, "A super admin already exists");
    }
    if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD || !SUPER_ADMIN_NAME || !SUPER_ADMIN_COMPANY_NAME) {
      throw new HttpException(
        500,
        "SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME, and SUPER_ADMIN_COMPANY_NAME must be set",
      );
    }

    const passwordHash = await Hash.hashPassword(SUPER_ADMIN_PASSWORD);
    const { user } = await this.companiesRepository.createWithUser({
      companyName: SUPER_ADMIN_COMPANY_NAME,
      fullName: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      role: "super_admin",
      invitedBy: null,
    });

    const tokenData = this.createToken(user);
    return { cookie: this.createCookie(tokenData), token: tokenData.token, user: toPublicUser(user) };
  }
}
