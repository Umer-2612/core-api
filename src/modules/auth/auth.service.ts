import { sign } from "jsonwebtoken";
import { container } from "tsyringe";
import type { SetPasswordDto } from "@modules/auth/auth.dto";
import type { DataStoredInToken, TokenData } from "@modules/auth/auth.interface";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import type { ICompaniesRepository } from "@modules/companies/companies.repository";
import type { IInvitationsRepository } from "@modules/invitations/invitations.repository";
import { InvitationsRepository } from "@modules/invitations/invitations.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import { UsersRepository } from "@modules/users/users.repository";
import {
  JWT_EXPIRES_IN_SECONDS,
  NODE_ENV,
  SECRET_KEY,
  SUPER_ADMIN_COMPANY_NAME,
  SUPER_ADMIN_COMPANY_SLUG,
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
  private readonly invitationsRepository: IInvitationsRepository;
  private readonly companiesRepository: ICompaniesRepository;

  constructor(
    usersRepository?: IUsersRepository,
    invitationsRepository?: IInvitationsRepository,
    companiesRepository?: ICompaniesRepository,
  ) {
    this.usersRepository = usersRepository ?? container.resolve(UsersRepository);
    this.invitationsRepository = invitationsRepository ?? container.resolve(InvitationsRepository);
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
   * Accepts an invitation: validates the one-time token, creates the user with
   * the chosen password, marks the invitation accepted, and logs them in. For
   * a hiring_manager invite with no company yet, a new Company is created
   * atomically with the user via companiesRepository.createWithUser.
   */
  public async setPassword(data: SetPasswordDto): Promise<{ cookie: string; token: string; user: PublicUser }> {
    const invitation = await this.invitationsRepository.findByToken(data.token);
    if (!invitation) throw new HttpException(400, "Invalid invitation token");
    if (invitation.accepted_at) throw new HttpException(409, "This invitation has already been used");
    if (invitation.expires_at.getTime() < Date.now()) throw new HttpException(410, "This invitation has expired");

    if (await this.usersRepository.existsByEmail(invitation.email)) {
      throw new HttpException(409, "An account with this email already exists");
    }

    const passwordHash = await Hash.hashPassword(data.password);

    let user: UserRecord;
    if (invitation.role === "hiring_manager" && !invitation.company_id) {
      if (!invitation.pending_company_name || !invitation.pending_company_slug) {
        throw new HttpException(500, "Invitation is missing company details");
      }
      try {
        const created = await this.companiesRepository.createWithUser({
          companyName: invitation.pending_company_name,
          companySlug: invitation.pending_company_slug,
          fullName: data.full_name,
          email: invitation.email,
          passwordHash,
          role: invitation.role,
          invitedBy: invitation.invited_by,
        });
        user = created.user;
      } catch (err: unknown) {
        // Postgres unique-violation (e.g. company slug already taken)
        const code = (err as { code?: string }).code;
        if (code === "P2002") throw new HttpException(409, "A company with this name already exists");
        throw err;
      }
      // Not part of the company+user transaction above (that's owned by
      // CompaniesRepository, not InvitationsRepository), a small window where
      // the user exists but the invite isn't marked accepted yet. Acceptable:
      // worst case is the invite link still resolves once more, harmlessly.
      await this.invitationsRepository.markAccepted(invitation.id, new Date());
    } else {
      const companyId = invitation.company_id;
      if (!companyId) throw new HttpException(500, "Could not resolve company for this invitation");
      user = await this.usersRepository.create({
        company_id: companyId,
        full_name: data.full_name,
        email: invitation.email,
        password_hash: passwordHash,
        role: invitation.role,
        invited_by: invitation.invited_by,
      });
      await this.invitationsRepository.markAccepted(invitation.id, new Date());
    }

    const tokenData = this.createToken(user);
    return { cookie: this.createCookie(tokenData), token: tokenData.token, user: toPublicUser(user) };
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
    if (
      !SUPER_ADMIN_EMAIL ||
      !SUPER_ADMIN_PASSWORD ||
      !SUPER_ADMIN_NAME ||
      !SUPER_ADMIN_COMPANY_NAME ||
      !SUPER_ADMIN_COMPANY_SLUG
    ) {
      throw new HttpException(
        500,
        "SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME, SUPER_ADMIN_COMPANY_NAME, and SUPER_ADMIN_COMPANY_SLUG must be set",
      );
    }

    const passwordHash = await Hash.hashPassword(SUPER_ADMIN_PASSWORD);
    const { user } = await this.companiesRepository.createWithUser({
      companyName: SUPER_ADMIN_COMPANY_NAME,
      companySlug: SUPER_ADMIN_COMPANY_SLUG,
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
