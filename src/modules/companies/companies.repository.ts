import type { Company } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateCompanyData {
  name: string;
  slug: string;
}

export interface ICompaniesRepository {
  findById(id: string): Promise<Company | null>;
  findBySlug(slug: string): Promise<Company | null>;
  create(data: CreateCompanyData): Promise<Company>;
}

/** Data access for the `companies` table (Prisma / Postgres). */
export class CompaniesRepository implements ICompaniesRepository {
  async findById(id: string): Promise<Company | null> {
    return prisma.company.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Company | null> {
    return prisma.company.findUnique({ where: { slug } });
  }

  async create(data: CreateCompanyData): Promise<Company> {
    return prisma.company.create({ data: { name: data.name, slug: data.slug } });
  }
}
