import { beforeEach, describe, expect, it } from "vitest";
import type { CreateCompanyData, CreateCompanyWithUserData, ICompaniesRepository } from "@modules/companies/companies.repository";
import { CompaniesService } from "@modules/companies/companies.service";
import type { CreateUserData, IUsersRepository, UpdateUserData } from "@modules/users/users.repository";
import type { Company, UserRecord, UserRole } from "@shared/interfaces/models.interface";

function makeCompany(overrides: Partial<Company> = {}): Company {
  return { id: "company-1", name: "Acme Corp", created_at: new Date("2026-01-01T00:00:00Z"), ...overrides };
}

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

class FakeCompaniesRepository implements ICompaniesRepository {
  companies: Company[] = [];
  async findById(id: string) {
    return this.companies.find((c) => c.id === id) ?? null;
  }
  async findByName(name: string) {
    return this.companies.find((c) => c.name === name) ?? null;
  }
  async findAll() {
    return this.companies;
  }
  async create(data: CreateCompanyData) {
    const company = makeCompany({ id: `company-${this.companies.length + 1}`, ...data });
    this.companies.push(company);
    return company;
  }
  async createWithUser(data: CreateCompanyWithUserData) {
    const company = await this.create({ name: data.companyName });
    const user = makeUser({ company_id: company.id, full_name: data.fullName, email: data.email, role: data.role });
    return { company, user };
  }
}

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
  async existsByRole(role: UserRole) {
    return this.users.some((u) => u.role === role);
  }
  async create(data: CreateUserData) {
    const user = makeUser({ id: `user-${this.users.length + 1}`, ...data });
    this.users.push(user);
    return user;
  }
  async update(id: string, data: UpdateUserData) {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new Error("not found");
    Object.assign(user, data);
    return user;
  }
  async delete(id: string) {
    this.users = this.users.filter((u) => u.id !== id);
  }
}

describe("CompaniesService", () => {
  let companies: FakeCompaniesRepository;
  let users: FakeUsersRepository;
  let service: CompaniesService;

  beforeEach(() => {
    companies = new FakeCompaniesRepository();
    users = new FakeUsersRepository();
    service = new CompaniesService(companies, users);
  });

  describe("list", () => {
    it("returns every company", async () => {
      companies.companies.push(makeCompany({ id: "c1" }), makeCompany({ id: "c2" }));
      const result = await service.list();
      expect(result).toHaveLength(2);
    });
  });

  describe("getByIdOrThrow", () => {
    it("404s for an unknown company", async () => {
      await expect(service.getByIdOrThrow("ghost")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("listUsers", () => {
    it("returns only that company's users, without password hashes", async () => {
      companies.companies.push(makeCompany({ id: "c1" }));
      users.users.push(makeUser({ id: "u1", company_id: "c1" }), makeUser({ id: "u2", company_id: "c2" }));

      const result = await service.listUsers("c1");

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("u1");
      expect(result[0]).not.toHaveProperty("password_hash");
    });

    it("404s when the company doesn't exist", async () => {
      await expect(service.listUsers("ghost")).rejects.toMatchObject({ status: 404 });
    });
  });
});
