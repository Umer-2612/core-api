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
   * Creates a hiring manager directly, no invite token or accept step. A
   * super admin must supply company_name (founds a brand-new company,
   * atomically, via companiesRepository.createWithUser); a hiring manager
   * creates a peer in their own company instead.
   */
  public async createUser(data: CreateUserDto, creator: PublicUser): Promise<PublicUser> {
    if (await this.usersRepository.existsByEmail(data.email)) {
      throw new HttpException(409, "A user with this email already exists");
    }

    const passwordHash = await Hash.hashPassword(data.password);

    if (creator.role === "super_admin") {
      if (!data.company_name) {
        throw new HttpException(400, "company_name is required when a super admin creates a hiring manager");
      }
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

    const user = await this.usersRepository.create({
      company_id: creator.company_id,
      full_name: data.full_name,
      email: data.email,
      password_hash: passwordHash,
      role: "hiring_manager",
      invited_by: creator.id,
    });
    return toPublicUser(user);
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
