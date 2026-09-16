import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ICompaniesRepository } from "@modules/companies/companies.repository";
import { EmailService } from "@modules/email/email.service";
import { InvitationsService } from "@modules/invitations/invitations.service";
import type { IInvitationsRepository } from "@modules/invitations/invitations.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import type { Company, Invitation, PublicUser } from "@shared/interfaces/models.interface";

vi.mock("@modules/email/email.service", () => ({
  EmailService: vi.fn(),
}));

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "invite-1",
    company_id: "company-1",
    email: "new-hm@acme.com",
    role: "hiring_manager",
    token: "tok-1",
    invited_by: "admin-1",
    expires_at: new Date(Date.now() + 60_000),
    accepted_at: null,
    created_at: new Date(),
    pending_company_name: null,
    pending_company_slug: null,
    ...overrides,
  };
}

function makeAdmin(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "admin-1",
    company_id: "company-1",
    full_name: "Root Admin",
    email: "admin@platform.com",
    role: "super_admin",
    is_active: true,
    created_at: new Date(),
    ...overrides,
  };
}

class FakeUsersRepository implements Pick<IUsersRepository, "existsByEmail"> {
  existing = new Set<string>();
  async existsByEmail(email: string) {
    return this.existing.has(email);
  }
}

class FakeCompaniesRepository implements Pick<ICompaniesRepository, "findById" | "findBySlug"> {
  companies: Company[] = [];
  async findById(id: string) {
    return this.companies.find((c) => c.id === id) ?? null;
  }
  async findBySlug(slug: string) {
    return this.companies.find((c) => c.slug === slug) ?? null;
  }
}

class FakeInvitationsRepository implements IInvitationsRepository {
  invitations: Invitation[] = [];
  async findByToken(token: string) {
    return this.invitations.find((i) => i.token === token) ?? null;
  }
  async findById(id: string) {
    return this.invitations.find((i) => i.id === id) ?? null;
  }
  async findAll(companyId?: string) {
    return companyId ? this.invitations.filter((i) => i.company_id === companyId) : this.invitations;
  }
  async upsert(data: Parameters<IInvitationsRepository["upsert"]>[0]) {
    const existing = this.invitations.find((i) => i.company_id === data.company_id && i.email === data.email);
    if (existing) {
      Object.assign(existing, data, { accepted_at: null });
      return existing;
    }
    const invite = makeInvitation({ id: `invite-${this.invitations.length + 1}`, ...data });
    this.invitations.push(invite);
    return invite;
  }
  async createForHiringManager(data: Parameters<IInvitationsRepository["createForHiringManager"]>[0]) {
    this.invitations = this.invitations.filter(
      (i) => !(i.email === data.email && i.role === "hiring_manager" && !i.accepted_at),
    );
    const invite = makeInvitation({ id: `invite-${this.invitations.length + 1}`, ...data, company_id: null });
    this.invitations.push(invite);
    return invite;
  }
  async markAccepted(id: string, acceptedAt: Date) {
    const invite = this.invitations.find((i) => i.id === id);
    if (invite) invite.accepted_at = acceptedAt;
  }
  async refreshToken(id: string, token: string, expiresAt: Date) {
    const invite = this.invitations.find((i) => i.id === id);
    if (!invite) throw new Error("not found");
    invite.token = token;
    invite.expires_at = expiresAt;
    return invite;
  }
  async delete(id: string) {
    this.invitations = this.invitations.filter((i) => i.id !== id);
  }
}

describe("InvitationsService", () => {
  let users: FakeUsersRepository;
  let companies: FakeCompaniesRepository;
  let invitations: FakeInvitationsRepository;
  let emailService: { sendHiringManagerInvitation: ReturnType<typeof vi.fn> };
  let service: InvitationsService;

  beforeEach(() => {
    users = new FakeUsersRepository();
    companies = new FakeCompaniesRepository();
    companies.companies.push({ id: "company-1", name: "Acme", slug: "acme", created_at: new Date() });
    invitations = new FakeInvitationsRepository();
    emailService = { sendHiringManagerInvitation: vi.fn().mockResolvedValue(undefined) };

    service = new InvitationsService(
      invitations,
      users as unknown as IUsersRepository,
      companies as unknown as ICompaniesRepository,
      emailService as unknown as EmailService,
    );
  });

  describe("invite", () => {
    it("super_admin inviting a hiring manager creates a pending-company invite and emails it", async () => {
      const result = await service.invite(
        { email: "founder@startup.com", pending_company_name: "StartupCo" },
        makeAdmin(),
      );

      expect(result.email).toBe("founder@startup.com");
      expect(invitations.invitations).toHaveLength(1);
      expect(invitations.invitations[0].pending_company_slug).toBe("startupco");
      expect(invitations.invitations[0].company_id).toBeNull();
      expect(emailService.sendHiringManagerInvitation).toHaveBeenCalledTimes(1);
    });

    it("super_admin without a company name is rejected", async () => {
      await expect(service.invite({ email: "founder@startup.com" }, makeAdmin())).rejects.toMatchObject({
        status: 400,
      });
    });

    it("super_admin cannot reuse a company name that already exists", async () => {
      companies.companies.push({ id: "company-2", name: "Acme", slug: "acme", created_at: new Date() });
      await expect(
        service.invite({ email: "founder@acme.com", pending_company_name: "Acme" }, makeAdmin()),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("hiring_manager inviting a teammate scopes the invite to their own company", async () => {
      const hm = makeAdmin({ id: "hm-1", role: "hiring_manager", company_id: "company-1" });
      const result = await service.invite({ email: "teammate@acme.com" }, hm);

      expect(result.email).toBe("teammate@acme.com");
      expect(invitations.invitations[0].company_id).toBe("company-1");
    });

    it("rejects inviting an email that's already a user", async () => {
      users.existing.add("existing@acme.com");
      await expect(service.invite({ email: "existing@acme.com" }, makeAdmin())).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe("getByToken", () => {
    it("resolves a valid pending invite", async () => {
      invitations.invitations.push(makeInvitation({ pending_company_name: "StartupCo", company_id: null }));
      const result = await service.getByToken("tok-1");
      expect(result.company_name).toBe("StartupCo");
    });

    it("rejects an unknown token", async () => {
      await expect(service.getByToken("missing")).rejects.toMatchObject({ status: 404 });
    });

    it("rejects an already-accepted invite", async () => {
      invitations.invitations.push(makeInvitation({ accepted_at: new Date() }));
      await expect(service.getByToken("tok-1")).rejects.toMatchObject({ status: 409 });
    });

    it("rejects an expired invite", async () => {
      invitations.invitations.push(makeInvitation({ expires_at: new Date(Date.now() - 1000) }));
      await expect(service.getByToken("tok-1")).rejects.toMatchObject({ status: 410 });
    });
  });

  describe("resend", () => {
    it("issues a new token and re-sends the email", async () => {
      invitations.invitations.push(makeInvitation());
      const oldToken = invitations.invitations[0].token;

      await service.resend("invite-1", makeAdmin());

      expect(invitations.invitations[0].token).not.toBe(oldToken);
      expect(emailService.sendHiringManagerInvitation).toHaveBeenCalledTimes(1);
    });

    it("refuses to resend an already-accepted invite", async () => {
      invitations.invitations.push(makeInvitation({ accepted_at: new Date() }));
      await expect(service.resend("invite-1", makeAdmin())).rejects.toMatchObject({ status: 409 });
    });
  });

  describe("cancel", () => {
    it("removes the invitation", async () => {
      invitations.invitations.push(makeInvitation());
      await service.cancel("invite-1");
      expect(invitations.invitations).toHaveLength(0);
    });
  });
});
