import { container } from "tsyringe";
import type { ICompaniesRepository } from "@modules/companies/companies.repository";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import type { IUsersRepository } from "@modules/users/users.repository";
import { UsersRepository } from "@modules/users/users.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import { type Company, type PublicUser, toPublicUser } from "@shared/interfaces/models.interface";

export class CompaniesService {
  private readonly companiesRepository: ICompaniesRepository;
  private readonly usersRepository: IUsersRepository;

  constructor(companiesRepository?: ICompaniesRepository, usersRepository?: IUsersRepository) {
    this.companiesRepository = companiesRepository ?? container.resolve(CompaniesRepository);
    this.usersRepository = usersRepository ?? container.resolve(UsersRepository);
  }

  public async list(): Promise<Company[]> {
    return this.companiesRepository.findAll();
  }

  public async getByIdOrThrow(id: string): Promise<Company> {
    const company = await this.companiesRepository.findById(id);
    if (!company) throw new HttpException(404, "Company not found");
    return company;
  }

  public async listUsers(companyId: string): Promise<PublicUser[]> {
    await this.getByIdOrThrow(companyId);
    const users = await this.usersRepository.findByCompany(companyId);
    return users.map(toPublicUser);
  }
}
