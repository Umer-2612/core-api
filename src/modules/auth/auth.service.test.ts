import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "@modules/auth/auth.service";
import type { CreateCompanyWithUserData, ICompaniesRepository } from "@modules/companies/companies.repository";
import type { IInvitationsRepository } from "@modules/invitations/invitations.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { Company, Invitation, UserRecord } from "@shared/interfaces/models.interface";
import { Hash } from "@shared/utils/hash";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    company_id: "company-1",
    full_name: "Jane HM",
    email: "jane@acme.com",
    password_hash: "will-be-overridden",
    role: "hiring_manager",
    invited_by: null,
    is_active: true,
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "invite-1",
    company_id: "company-1",
    email: "jane@acme.com",
    role: "hiring_manager",
    token: "tok-1",
    invited_by: "admin-1",
    expires_at: new Date(Date.now() + 60_000),
    accepted_at: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    pending_company_name: null,
    pending_company_slug: null,
    ...overrides,
  };
}

/** In-memory fakes, not spies, enough to drive AuthService's real branches. */
class FakeUsersRepository implements IUsersRepository {
  users: UserRecord[] = [];
  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findByCompany(companyId: string) {
    return this.users.filter((u) => u.company_id === companyId);
  }
  async existsByEmail(email: string) {
    return this.users.some((u) => u.email === email);
  }
  async existsByRole(role: UserRecord["role"]) {
    return this.users.some((u) => u.role === role);
  }
  async create(data: Parameters<IUsersRepository["create"]>[0]) {
    const user = makeUser({ id: `user-${this.users.length + 1}`, ...data });
    this.users.push(user);
    return user;
  }
  async update(id: string, data: Parameters<IUsersRepository["update"]>[1]) {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new Error("not found");
    Object.assign(user, data);
    return user;
  }
  async delete(id: string) {
    this.users = this.users.filter((u) => u.id !== id);
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
  async findAll() {
    return this.invitations;
  }
  async upsert(data: Parameters<IInvitationsRepository["upsert"]>[0]) {
    const invite = makeInvitation({ id: `invite-${this.invitations.length + 1}`, ...data });
    this.invitations.push(invite);
    return invite;
  }
  async createForHiringManager(data: Parameters<IInvitationsRepository["createForHiringManager"]>[0]) {
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

class FakeCompaniesRepository implements ICompaniesRepository {
  companies: Company[] = [];
  createWithUserCalls: CreateCompanyWithUserData[] = [];
  async findById(id: string) {
    return this.companies.find((c) => c.id === id) ?? null;
  }
  async findBySlug(slug: string) {
    return this.companies.find((c) => c.slug === slug) ?? null;
  }
  async create(data: { name: string; slug: string }) {
    const company: Company = { id: `company-${this.companies.length + 1}`, ...data, created_at: new Date() };
    this.companies.push(company);
    return company;
  }
  async createWithUser(data: CreateCompanyWithUserData) {
    this.createWithUserCalls.push(data);
    const company = await this.create({ name: data.companyName, slug: data.companySlug });
    const user = makeUser({
      id: `user-${company.id}`,
      company_id: company.id,
      full_name: data.fullName,
      email: data.email,
      password_hash: data.passwordHash,
      role: data.role,
      invited_by: data.invitedBy,
    });
    return { company, user };
  }
}

describe("AuthService", () => {
  let users: FakeUsersRepository;
  let invitations: FakeInvitationsRepository;
  let companies: FakeCompaniesRepository;
  let service: AuthService;

  beforeEach(() => {
    users = new FakeUsersRepository();
    invitations = new FakeInvitationsRepository();
    companies = new FakeCompaniesRepository();
    service = new AuthService(users, invitations, companies);
  });

  describe("login", () => {
    it("returns a token and public user on correct credentials", async () => {
      const passwordHash = await Hash.hashPassword("correct-horse-battery");
      users.users.push(makeUser({ password_hash: passwordHash }));

      const result = await service.login({ email: "jane@acme.com", password: "correct-horse-battery" });

      expect(result.token).toBeTruthy();
      expect(result.cookie).toContain("Authorization=");
      expect(result.user.email).toBe("jane@acme.com");
      // never leaks the hash to the client
      expect(result.user).not.toHaveProperty("password_hash");
    });

    it("rejects an unknown email", async () => {
      await expect(service.login({ email: "nobody@acme.com", password: "whatever123" })).rejects.toThrow(
        HttpException,
      );
    });

    it("rejects a wrong password without revealing which part was wrong", async () => {
      const passwordHash = await Hash.hashPassword("correct-horse-battery");
      users.users.push(makeUser({ password_hash: passwordHash }));

      await expect(service.login({ email: "jane@acme.com", password: "wrong-password" })).rejects.toMatchObject({
        status: 401,
        message: "Invalid email or password",
      });
    });
  });

  describe("me", () => {
    it("returns the public shape for a known user", async () => {
      users.users.push(makeUser());
      const result = await service.me("user-1");
      expect(result.email).toBe("jane@acme.com");
    });

    it("throws 404 for an unknown user id", async () => {
      await expect(service.me("ghost")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("setPassword", () => {
    it("rejects an invalid token", async () => {
      await expect(service.setPassword({ token: "nope", full_name: "X", password: "abc12345" })).rejects.toMatchObject({
        status: 400,
      });
    });

    it("rejects an already-accepted invitation", async () => {
      invitations.invitations.push(makeInvitation({ accepted_at: new Date() }));
      await expect(
        service.setPassword({ token: "tok-1", full_name: "X", password: "abc12345" }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("rejects an expired invitation", async () => {
      invitations.invitations.push(makeInvitation({ expires_at: new Date(Date.now() - 1000) }));
      await expect(
        service.setPassword({ token: "tok-1", full_name: "X", password: "abc12345" }),
      ).rejects.toMatchObject({ status: 410 });
    });

    it("rejects when an account with that email already exists", async () => {
      invitations.invitations.push(makeInvitation());
      users.users.push(makeUser());
      await expect(
        service.setPassword({ token: "tok-1", full_name: "X", password: "abc12345" }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("creates a user under an existing company and marks the invite accepted", async () => {
      invitations.invitations.push(makeInvitation({ company_id: "company-1" }));

      const result = await service.setPassword({ token: "tok-1", full_name: "Jane HM", password: "abc12345" });

      expect(result.user.company_id).toBe("company-1");
      expect(users.users).toHaveLength(1);
      expect(invitations.invitations[0].accepted_at).not.toBeNull();
      // the no-company branch shouldn't fire here
      expect(companies.createWithUserCalls).toHaveLength(0);
    });

    it("creates a new company atomically with the user when the invite has no company yet", async () => {
      invitations.invitations.push(
        makeInvitation({
          company_id: null,
          pending_company_name: "Acme Corp",
          pending_company_slug: "acme-corp",
        }),
      );

      const result = await service.setPassword({ token: "tok-1", full_name: "Jane HM", password: "abc12345" });

      expect(companies.createWithUserCalls).toHaveLength(1);
      expect(companies.createWithUserCalls[0].companySlug).toBe("acme-corp");
      expect(result.user.company_id).toBe(companies.companies[0].id);
      expect(invitations.invitations[0].accepted_at).not.toBeNull();
    });

    it("rejects a no-company hiring_manager invite missing pending company details", async () => {
      invitations.invitations.push(makeInvitation({ company_id: null, pending_company_name: null }));
      await expect(
        service.setPassword({ token: "tok-1", full_name: "X", password: "abc12345" }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  describe("bootstrapAdmin", () => {
    it("creates the super admin from SUPER_ADMIN_* env vars when none exists yet", async () => {
      const result = await service.bootstrapAdmin();

      expect(result.user.role).toBe("super_admin");
      expect(result.user.email).toBe("admin@test.local");
      expect(companies.createWithUserCalls).toHaveLength(1);
      expect(companies.createWithUserCalls[0].role).toBe("super_admin");
      expect(result.token).toBeTruthy();
    });

    it("refuses to run if a super_admin already exists", async () => {
      users.users.push(makeUser({ role: "super_admin" }));
      await expect(service.bootstrapAdmin()).rejects.toMatchObject({ status: 409 });
    });
  });
});
