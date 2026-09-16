import { sign } from "jsonwebtoken";
import { container } from "tsyringe";
import type { SetPasswordDto } from "@modules/auth/auth.dto";
import type { DataStoredInToken, TokenData } from "@modules/auth/auth.interface";
import type { IInvitationsRepository } from "@modules/invitations/invitations.repository";
import { InvitationsRepository } from "@modules/invitations/invitations.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import { UsersRepository } from "@modules/users/users.repository";
import { JWT_EXPIRES_IN_SECONDS, NODE_ENV, SECRET_KEY } from "@shared/config/env";
import { HttpException } from "@shared/exceptions/http.exception";
import { type PublicUser, toPublicUser, type UserRecord } from "@shared/interfaces/models.interface";
import { Hash } from "@shared/utils/hash";
import { logger } from "@shared/utils/logger";
import { prisma } from "@/db/prisma";

export class AuthService {
  private readonly usersRepository: IUsersRepository;
  private readonly invitationsRepository: IInvitationsRepository;

  constructor(usersRepository?: IUsersRepository, invitationsRepository?: IInvitationsRepository) {
    this.usersRepository = usersRepository ?? container.resolve(UsersRepository);
    this.invitationsRepository = invitationsRepository ?? container.resolve(InvitationsRepository);
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
   * the chosen password, marks the invitation accepted, and logs them in.
   * For hiring_manager invites, a new Company is created in the same transaction.
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
        user = await prisma.$transaction(async (tx) => {
          const company = await tx.company.create({
            data: { name: invitation.pending_company_name!, slug: invitation.pending_company_slug! },
          });
          const newUser = await tx.user.create({
            data: {
              company_id: company.id,
              full_name: data.full_name,
              email: invitation.email,
              password_hash: passwordHash,
              role: invitation.role,
              invited_by: invitation.invited_by,
            },
          });
          await tx.invitation.update({ where: { id: invitation.id }, data: { accepted_at: new Date() } });
          return newUser;
        });
      } catch (err: unknown) {
        // Postgres unique-violation (e.g. company slug already taken)
        const code = (err as { code?: string }).code;
        if (code === "P2002") throw new HttpException(409, "A company with this name already exists");
        throw err;
      }
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
}
