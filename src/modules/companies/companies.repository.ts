import type { Company, UserRecord, UserRole } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateCompanyData {
  name: string;
}

export interface CreateCompanyWithUserData {
  companyName: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  invitedBy: string | null;
}

export interface ICompaniesRepository {
  findById(id: string): Promise<Company | null>;
  findByName(name: string): Promise<Company | null>;
  create(data: CreateCompanyData): Promise<Company>;
  /** Atomically creates a company and its first user (super admin creating a hiring manager). */
  createWithUser(data: CreateCompanyWithUserData): Promise<{ company: Company; user: UserRecord }>;
}

/** Data access for the `companies` table (Prisma / Postgres). */
export class CompaniesRepository implements ICompaniesRepository {
  async findById(id: string): Promise<Company | null> {
    return prisma.company.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Company | null> {
    return prisma.company.findUnique({ where: { name } });
  }

  async create(data: CreateCompanyData): Promise<Company> {
    return prisma.company.create({ data: { name: data.name } });
  }

  async createWithUser(data: CreateCompanyWithUserData): Promise<{ company: Company; user: UserRecord }> {
    return prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: data.companyName } });
      const user = await tx.user.create({
        data: {
          company_id: company.id,
          full_name: data.fullName,
          email: data.email,
          password_hash: data.passwordHash,
          role: data.role,
          invited_by: data.invitedBy,
        },
      });
      return { company, user };
    });
  }
}
