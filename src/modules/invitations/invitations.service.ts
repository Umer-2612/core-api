import { container } from "tsyringe";
import { INVITATION_EXPIRY_HOURS } from "@shared/config/env";
import { HttpException } from "@shared/exceptions/http.exception";
import type { Invitation, PublicUser, UserRole } from "@shared/interfaces/models.interface";
import type { ICompaniesRepository } from "@modules/companies/companies.repository";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import { EmailService } from "@modules/email/email.service";
import type { CreateInvitationDto } from "@modules/invitations/invitations.dto";
import type { IInvitationsRepository } from "@modules/invitations/invitations.repository";
import { InvitationsRepository } from "@modules/invitations/invitations.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import { UsersRepository } from "@modules/users/users.repository";
import { generateSecureToken } from "@shared/utils/token";

export interface InvitationSummary {
  email: string;
  role: UserRole;
  expires_at: Date;
}

export interface PublicInvitation {
  email: string;
  role: UserRole;
  company_name: string;
}

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function expiresAt(): Date {
  return new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);
}

export class InvitationsService {
  private readonly invitationsRepository: IInvitationsRepository;
  private readonly usersRepository: IUsersRepository;
  private readonly companiesRepository: ICompaniesRepository;
  private readonly emailService: EmailService;

  constructor(
    invitationsRepository?: IInvitationsRepository,
    usersRepository?: IUsersRepository,
    companiesRepository?: ICompaniesRepository,
    emailService?: EmailService,
  ) {
    this.invitationsRepository = invitationsRepository ?? container.resolve(InvitationsRepository);
    this.usersRepository = usersRepository ?? container.resolve(UsersRepository);
    this.companiesRepository = companiesRepository ?? container.resolve(CompaniesRepository);
    this.emailService = emailService ?? container.resolve(EmailService);
  }

  public async invite(data: CreateInvitationDto, inviter: PublicUser): Promise<InvitationSummary> {
    if (await this.usersRepository.existsByEmail(data.email)) {
      throw new HttpException(409, "A user with this email already exists");
    }

    const token = generateSecureToken();
    const exp = expiresAt();

    if (inviter.role === "super_admin") {
      // Admin creates a new company and invites a hiring manager to run it.
      if (!data.pending_company_name) {
        throw new HttpException(400, "Company name is required when inviting a hiring manager");
      }
      const slug = toSlug(data.pending_company_name);
      if (!slug || !/^[a-z0-9]/.test(slug)) {
        throw new HttpException(400, "Company name produces an invalid slug: must start with a letter or number");
      }
      const existingCompany = await this.companiesRepository.findBySlug(slug);
      if (existingCompany) {
        throw new HttpException(409, `A company named "${data.pending_company_name}" already exists`);
      }

      const invitation = await this.invitationsRepository.createForHiringManager({
        email: data.email,
        role: "hiring_manager",
        token,
        invited_by: inviter.id,
        expires_at: exp,
        pending_company_name: data.pending_company_name,
        pending_company_slug: slug,
        company_id: null,
      });

      await this.emailService.sendHiringManagerInvitation({
        to: data.email,
        token,
        companyName: data.pending_company_name,
        inviterName: inviter.full_name,
      });

      return { email: invitation.email, role: invitation.role, expires_at: invitation.expires_at };
    }

    // Hiring manager inviting another hiring manager into their own company.
    const company = await this.companiesRepository.findById(inviter.company_id);
    if (!company) throw new HttpException(404, "Company not found");

    const invitation = await this.invitationsRepository.upsert({
      company_id: inviter.company_id,
      email: data.email,
      role: "hiring_manager",
      token,
      invited_by: inviter.id,
      expires_at: exp,
    });

    await this.emailService.sendHiringManagerInvitation({
      to: data.email,
      token,
      companyName: company.name,
      inviterName: inviter.full_name,
    });

    return { email: invitation.email, role: invitation.role, expires_at: invitation.expires_at };
  }

  public async list(viewer: PublicUser): Promise<Invitation[]> {
    const companyId = viewer.role === "super_admin" ? undefined : viewer.company_id;
    return this.invitationsRepository.findAll(companyId);
  }

  public async resend(id: string, inviter: PublicUser): Promise<void> {
    const existing = await this.invitationsRepository.findById(id);
    if (!existing) throw new HttpException(404, "Invitation not found");
    if (existing.accepted_at) throw new HttpException(409, "Invitation already accepted");

    const token = generateSecureToken();
    const exp = expiresAt();
    const updated = await this.invitationsRepository.refreshToken(id, token, exp);

    const companyName =
      updated.pending_company_name ??
      (updated.company_id ? (await this.companiesRepository.findById(updated.company_id))?.name ?? "" : "");

    await this.emailService.sendHiringManagerInvitation({
      to: updated.email,
      token,
      companyName,
      inviterName: inviter.full_name,
    });
  }

  public async cancel(id: string): Promise<void> {
    await this.invitationsRepository.delete(id);
  }

  public async getByToken(token: string): Promise<PublicInvitation> {
    const invitation = await this.invitationsRepository.findByToken(token);
    if (!invitation) throw new HttpException(404, "Invalid invitation token");
    if (invitation.accepted_at) throw new HttpException(409, "This invitation has already been used");
    if (invitation.expires_at.getTime() < Date.now()) {
      throw new HttpException(410, "This invitation has expired");
    }

    const companyName =
      invitation.pending_company_name ??
      (invitation.company_id ? (await this.companiesRepository.findById(invitation.company_id))?.name ?? "" : "");

    return { email: invitation.email, role: invitation.role, company_name: companyName };
  }
}
