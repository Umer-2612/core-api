import "reflect-metadata";
import { container } from "tsyringe";
import { AuthController } from "@modules/auth/auth.controller";
import { AuthRoute } from "@modules/auth/auth.routes";
import { AuthService } from "@modules/auth/auth.service";
import { CandidatesController } from "@modules/candidates/candidates.controller";
import { CandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesService } from "@modules/candidates/candidates.service";
import { S3ResumeStorage } from "@modules/candidates/resume-storage";
import { CompaniesController } from "@modules/companies/companies.controller";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import { CompaniesRoute } from "@modules/companies/companies.routes";
import { CompaniesService } from "@modules/companies/companies.service";
import { JobsController } from "@modules/jobs/jobs.controller";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import { JobsRoute } from "@modules/jobs/jobs.routes";
import { JobsService } from "@modules/jobs/jobs.service";
import { UsersController } from "@modules/users/users.controller";
import { UsersRepository } from "@modules/users/users.repository";
import { UsersRoute } from "@modules/users/users.routes";
import { UsersService } from "@modules/users/users.service";

let isContainerInitialized = false;

export function setupContainer() {
  if (isContainerInitialized) return;

  // Infrastructure layer: repositories.
  const usersRepository = new UsersRepository();
  const companiesRepository = new CompaniesRepository();
  const jobsRepository = new JobsRepository();
  const candidatesRepository = new CandidatesRepository();
  const resumeStorage = new S3ResumeStorage();

  container.registerInstance(UsersRepository, usersRepository);
  container.registerInstance(CompaniesRepository, companiesRepository);
  container.registerInstance(JobsRepository, jobsRepository);
  container.registerInstance(CandidatesRepository, candidatesRepository);
  container.registerInstance(S3ResumeStorage, resumeStorage);

  // Business layer: services.
  const authService = new AuthService(usersRepository, companiesRepository);
  const usersService = new UsersService(usersRepository, companiesRepository);
  const jobsService = new JobsService(jobsRepository);
  const candidatesService = new CandidatesService(candidatesRepository, jobsService, resumeStorage);
  const companiesService = new CompaniesService(companiesRepository, usersRepository);

  container.registerInstance(AuthService, authService);
  container.registerInstance(UsersService, usersService);
  container.registerInstance(JobsService, jobsService);
  container.registerInstance(CandidatesService, candidatesService);
  container.registerInstance(CompaniesService, companiesService);

  // Presentation layer: controllers and routes (auto-injected).
  container.registerSingleton(AuthController);
  container.registerSingleton(UsersController);
  container.registerSingleton(JobsController);
  container.registerSingleton(CandidatesController);
  container.registerSingleton(CompaniesController);
  container.registerSingleton(AuthRoute);
  container.registerSingleton(UsersRoute);
  container.registerSingleton(JobsRoute);
  container.registerSingleton(CompaniesRoute);

  isContainerInitialized = true;
}
