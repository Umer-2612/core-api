import type { UserRecord, UserRole } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface CreateUserData {
  company_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  invited_by?: string | null;
}

export interface UpdateUserData {
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
  avatar_url?: string | null;
}

export interface IUsersRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByCompany(companyId: string): Promise<UserRecord[]>;
  existsByEmail(email: string): Promise<boolean>;
  create(data: CreateUserData): Promise<UserRecord>;
  update(id: string, data: UpdateUserData): Promise<UserRecord>;
  delete(id: string): Promise<void>;
}

/** Data access for the `users` table (Prisma / Postgres). */
export class UsersRepository implements IUsersRepository {
  async findById(id: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  }

  async findByCompany(companyId: string): Promise<UserRecord[]> {
    return prisma.user.findMany({ where: { company_id: companyId }, orderBy: { created_at: "desc" } });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { email: email.toLowerCase().trim() } });
    return count > 0;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    return prisma.user.create({
      data: {
        company_id: data.company_id,
        full_name: data.full_name,
        email: data.email.toLowerCase().trim(),
        password_hash: data.password_hash,
        role: data.role,
        invited_by: data.invited_by ?? null,
      },
    });
  }

  async update(id: string, data: UpdateUserData): Promise<UserRecord> {
    return prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}
