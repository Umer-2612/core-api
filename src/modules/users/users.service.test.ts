import { beforeEach, describe, expect, it } from "vitest";
import type { CreateCompanyWithUserData, ICompaniesRepository } from "@modules/companies/companies.repository";
import type { CreateUserDto } from "@modules/users/users.dto";
import type { IUsersRepository } from "@modules/users/users.repository";
import { UsersService } from "@modules/users/users.service";
import type { Company, PublicUser, UserRecord } from "@shared/interfaces/models.interface";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    company_id: "company-1",
    full_name: "Jane HM",
    email: "jane@acme.com",
    password_hash: "hash",
    role: "hiring_manager",
    status: "active",
    invited_by: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    company_id: user.company_id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
  };
}

/** In-memory fakes, not spies, enough to drive UsersService's real branches. */
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

function makeDto(overrides: Partial<CreateUserDto> = {}): CreateUserDto {
  return {
    company_name: "Acme Corp",
    full_name: "New Hire",
    email: "new-hire@acme.com",
    password: "abc12345",
    ...overrides,
  };
}

describe("UsersService", () => {
  let users: FakeUsersRepository;
  let companies: FakeCompaniesRepository;
  let service: UsersService;

  beforeEach(() => {
    users = new FakeUsersRepository();
    companies = new FakeCompaniesRepository();
    service = new UsersService(users, companies);
  });

  describe("createUser", () => {
    it("creates a brand-new company and its hiring manager together", async () => {
      const superAdmin = toPublic(makeUser({ id: "admin-1", role: "super_admin" }));

      const result = await service.createUser(makeDto({ company_name: "Acme Corp" }), superAdmin);

      expect(result.role).toBe("hiring_manager");
      expect(companies.createWithUserCalls).toHaveLength(1);
      expect(companies.createWithUserCalls[0].companyName).toBe("Acme Corp");
      expect(companies.createWithUserCalls[0].invitedBy).toBe("admin-1");
    });

    it("rejects when a user with that email already exists", async () => {
      const superAdmin = toPublic(makeUser({ id: "admin-1", role: "super_admin" }));
      users.users.push(makeUser({ email: "new-hire@acme.com" }));

      await expect(service.createUser(makeDto(), superAdmin)).rejects.toMatchObject({ status: 409 });
    });

    it("rejects when the company name is already taken", async () => {
      const superAdmin = toPublic(makeUser({ id: "admin-1", role: "super_admin" }));
      companies.companies.push({ id: "company-1", name: "Acme Corp", created_at: new Date() });
      companies.createWithUser = async () => {
        const err = new Error("Unique constraint failed") as Error & { code: string };
        err.code = "P2002";
        throw err;
      };

      await expect(service.createUser(makeDto({ company_name: "Acme Corp" }), superAdmin)).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe("list", () => {
    it("super admin sees every company's users", async () => {
      users.users.push(makeUser({ id: "u1", company_id: "company-1" }), makeUser({ id: "u2", company_id: "company-2" }));
      const superAdmin = toPublic(makeUser({ id: "admin-1", role: "super_admin", company_id: "company-1" }));

      const result = await service.list(superAdmin);

      expect(result).toHaveLength(2);
    });

    it("hiring manager sees only their own company's users", async () => {
      users.users.push(makeUser({ id: "u1", company_id: "company-1" }), makeUser({ id: "u2", company_id: "company-2" }));
      const hiringManager = toPublic(makeUser({ id: "u1", company_id: "company-1" }));

      const result = await service.list(hiringManager);

      expect(result).toHaveLength(1);
      expect(result[0].company_id).toBe("company-1");
    });
  });
});
