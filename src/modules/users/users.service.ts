import { container } from "tsyringe";
import type { ICompaniesRepository } from "@modules/companies/companies.repository";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import type { CreateUserDto } from "@modules/users/users.dto";
import type { IUsersRepository } from "@modules/users/users.repository";
import { UsersRepository } from "@modules/users/users.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import { type PublicUser, toPublicUser } from "@shared/interfaces/models.interface";
import { Hash } from "@shared/utils/hash";

export class UsersService {
  private readonly usersRepository: IUsersRepository;
  private readonly companiesRepository: ICompaniesRepository;

  constructor(usersRepository?: IUsersRepository, companiesRepository?: ICompaniesRepository) {
    this.usersRepository = usersRepository ?? container.resolve(UsersRepository);
    this.companiesRepository = companiesRepository ?? container.resolve(CompaniesRepository);
  }

  /**
   * Super admin only (enforced at the route). Founds a brand-new company and
   * its first hiring manager together, atomically, no invite token or accept
   * step. Hiring managers cannot create other hiring managers.
   */
  public async createUser(data: CreateUserDto, creator: PublicUser): Promise<PublicUser> {
    if (await this.usersRepository.existsByEmail(data.email)) {
      throw new HttpException(409, "A user with this email already exists");
    }

    const passwordHash = await Hash.hashPassword(data.password);

    try {
      const { user } = await this.companiesRepository.createWithUser({
        companyName: data.company_name,
        fullName: data.full_name,
        email: data.email,
        passwordHash,
        role: "hiring_manager",
        invitedBy: creator.id,
      });
      return toPublicUser(user);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") throw new HttpException(409, `A company named "${data.company_name}" already exists`);
      throw err;
    }
  }

  /** super_admin sees every user; hiring_manager sees only their own company's. */
  public async list(viewer: PublicUser): Promise<PublicUser[]> {
    const users =
      viewer.role === "super_admin"
        ? await this.usersRepository.findAll()
        : await this.usersRepository.findByCompany(viewer.company_id);
    return users.map(toPublicUser);
  }
}
