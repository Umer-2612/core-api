import type { Invitation, UserRole } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateInvitationData {
  company_id?: string | null;
  email: string;
  role: UserRole;
  token: string;
  invited_by: string | null;
  expires_at: Date;
  pending_company_name?: string | null;
  pending_company_slug?: string | null;
}

export interface IInvitationsRepository {
  findByToken(token: string): Promise<Invitation | null>;
  findById(id: string): Promise<Invitation | null>;
  findAll(companyId?: string): Promise<Invitation[]>;
  upsert(data: CreateInvitationData): Promise<Invitation>;
  createForHiringManager(data: CreateInvitationData): Promise<Invitation>;
  markAccepted(id: string, acceptedAt: Date): Promise<void>;
  refreshToken(id: string, token: string, expiresAt: Date): Promise<Invitation>;
  delete(id: string): Promise<void>;
}

/** Data access for the `invitations` table (Prisma / Postgres). */
export class InvitationsRepository implements IInvitationsRepository {
  async findByToken(token: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({ where: { token } });
  }

  async findById(id: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({ where: { id } });
  }

  async findAll(companyId?: string): Promise<Invitation[]> {
    return prisma.invitation.findMany({
      where: companyId ? { company_id: companyId } : {},
      orderBy: { created_at: "desc" },
    });
  }

  /** Hiring manager inviting another hiring manager into their own company: one pending invite per email. */
  async upsert(data: CreateInvitationData): Promise<Invitation> {
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.invitation.findFirst({
      where: { company_id: data.company_id ?? null, email },
    });

    if (existing) {
      return prisma.invitation.update({
        where: { id: existing.id },
        data: {
          role: data.role,
          token: data.token,
          invited_by: data.invited_by,
          expires_at: data.expires_at,
          accepted_at: null,
        },
      });
    }

    return prisma.invitation.create({
      data: {
        company_id: data.company_id ?? null,
        email,
        role: data.role,
        token: data.token,
        invited_by: data.invited_by,
        expires_at: data.expires_at,
      },
    });
  }

  /** Super admin inviting a hiring manager: no company yet, clears any prior pending invite for the email. */
  async createForHiringManager(data: CreateInvitationData): Promise<Invitation> {
    const email = data.email.toLowerCase().trim();
    await prisma.invitation.deleteMany({
      where: { email, role: "hiring_manager", accepted_at: null },
    });
    return prisma.invitation.create({
      data: {
        company_id: null,
        email,
        role: data.role,
        token: data.token,
        invited_by: data.invited_by,
        expires_at: data.expires_at,
        pending_company_name: data.pending_company_name ?? null,
        pending_company_slug: data.pending_company_slug ?? null,
      },
    });
  }

  async markAccepted(id: string, acceptedAt: Date): Promise<void> {
    await prisma.invitation.update({ where: { id }, data: { accepted_at: acceptedAt } });
  }

  async refreshToken(id: string, token: string, expiresAt: Date): Promise<Invitation> {
    return prisma.invitation.update({ where: { id }, data: { token, expires_at: expiresAt } });
  }

  async delete(id: string): Promise<void> {
    await prisma.invitation.delete({ where: { id } });
  }
}
