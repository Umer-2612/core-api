import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "@modules/auth/auth.service";
import type { CreateCompanyWithUserData, ICompaniesRepository } from "@modules/companies/companies.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { Company, UserRecord } from "@shared/interfaces/models.interface";
import { Hash } from "@shared/utils/hash";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    company_id: "company-1",
    full_name: "Jane HM",
    email: "jane@acme.com",
    password_hash: "will-be-overridden",
    role: "hiring_manager",
    status: "active",
    invited_by: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
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
  async findAll() {
    return this.users;
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

class FakeCompaniesRepository implements ICompaniesRepository {
  companies: Company[] = [];
  createWithUserCalls: CreateCompanyWithUserData[] = [];
  async findById(id: string) {
    return this.companies.find((c) => c.id === id) ?? null;
  }
  async findByName(name: string) {
    return this.companies.find((c) => c.name === name) ?? null;
  }
  async findAll() {
    return this.companies;
  }
  async create(data: { name: string }) {
    const company: Company = { id: `company-${this.companies.length + 1}`, ...data, created_at: new Date() };
    this.companies.push(company);
    return company;
  }
  async createWithUser(data: CreateCompanyWithUserData) {
    this.createWithUserCalls.push(data);
    const company = await this.create({ name: data.companyName });
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
  let companies: FakeCompaniesRepository;
  let service: AuthService;

  beforeEach(() => {
    users = new FakeUsersRepository();
    companies = new FakeCompaniesRepository();
    service = new AuthService(users, companies);
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
