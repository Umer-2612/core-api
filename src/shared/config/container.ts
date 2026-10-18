import "reflect-metadata";
import { container } from "tsyringe";
import { AuthController } from "@modules/auth/auth.controller";
import { AuthRoute } from "@modules/auth/auth.routes";
import { AuthService } from "@modules/auth/auth.service";
import { CandidateProfileRepository } from "@modules/candidates/candidate-profile.repository";
import { CandidatesController } from "@modules/candidates/candidates.controller";
import { CandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesService } from "@modules/candidates/candidates.service";
import { S3ResumeStorage } from "@modules/candidates/resume-storage";
import { CompaniesController } from "@modules/companies/companies.controller";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import { CompaniesRoute } from "@modules/companies/companies.routes";
import { CompaniesService } from "@modules/companies/companies.service";
import { InterviewSessionsController } from "@modules/interview-sessions/interview-sessions.controller";
import { InterviewSessionsRepository } from "@modules/interview-sessions/interview-sessions.repository";
import { InterviewSessionsService } from "@modules/interview-sessions/interview-sessions.service";
import { JobsController } from "@modules/jobs/jobs.controller";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import { JobsRoute } from "@modules/jobs/jobs.routes";
import { JobsService } from "@modules/jobs/jobs.service";
import { PortalController } from "@modules/portal/portal.controller";
import { PortalRepository } from "@modules/portal/portal.repository";
import { PortalRoute } from "@modules/portal/portal.routes";
import { PortalService } from "@modules/portal/portal.service";
import { SystemDesignAi } from "@modules/portal/system-design/ai";
import { SystemDesignPortalController } from "@modules/portal/system-design/system-design.controller";
import { SystemDesignRepository } from "@modules/portal/system-design/system-design.repository";
import { SystemDesignPortalService } from "@modules/portal/system-design/system-design.service";
import { SystemDesignProblemsController } from "@modules/system-design-problems/system-design-problems.controller";
import { SystemDesignProblemsRepository } from "@modules/system-design-problems/system-design-problems.repository";
import { SystemDesignProblemsRoute } from "@modules/system-design-problems/system-design-problems.routes";
import { SystemDesignProblemsService } from "@modules/system-design-problems/system-design-problems.service";
import { UsersController } from "@modules/users/users.controller";
import { UsersRepository } from "@modules/users/users.repository";
import { UsersRoute } from "@modules/users/users.routes";
import { UsersService } from "@modules/users/users.service";

import { GroqClient } from "@shared/llm/llm-client";

let isContainerInitialized = false;

export function setupContainer() {
  if (isContainerInitialized) return;

  // Infrastructure layer: repositories.
  const usersRepository = new UsersRepository();
  const companiesRepository = new CompaniesRepository();
  const jobsRepository = new JobsRepository();
  const candidatesRepository = new CandidatesRepository();
  const candidateProfileRepository = new CandidateProfileRepository();
  const interviewSessionsRepository = new InterviewSessionsRepository();
  const portalRepository = new PortalRepository();
  const resumeStorage = new S3ResumeStorage();
  const systemDesignRepository = new SystemDesignRepository();
  const systemDesignProblemsRepository = new SystemDesignProblemsRepository();
  const systemDesignAi = new SystemDesignAi(new GroqClient());

  container.registerInstance(UsersRepository, usersRepository);
  container.registerInstance(CompaniesRepository, companiesRepository);
  container.registerInstance(JobsRepository, jobsRepository);
  container.registerInstance(CandidatesRepository, candidatesRepository);
  container.registerInstance(CandidateProfileRepository, candidateProfileRepository);
  container.registerInstance(InterviewSessionsRepository, interviewSessionsRepository);
  container.registerInstance(PortalRepository, portalRepository);
  container.registerInstance(S3ResumeStorage, resumeStorage);
  container.registerInstance(SystemDesignRepository, systemDesignRepository);
  container.registerInstance(SystemDesignProblemsRepository, systemDesignProblemsRepository);
  container.registerInstance(SystemDesignAi, systemDesignAi);

  // Business layer: services.
  const authService = new AuthService(usersRepository, companiesRepository);
  const usersService = new UsersService(usersRepository, companiesRepository);
  const jobsService = new JobsService(jobsRepository);
  const candidatesService = new CandidatesService(candidatesRepository, jobsService, resumeStorage, candidateProfileRepository);
  const companiesService = new CompaniesService(companiesRepository, usersRepository);
  const systemDesignProblemsService = new SystemDesignProblemsService(systemDesignProblemsRepository);
  const interviewSessionsService = new InterviewSessionsService(interviewSessionsRepository, candidatesService, systemDesignProblemsService);
  const portalService = new PortalService(portalRepository);
  const systemDesignPortalService = new SystemDesignPortalService(portalRepository, systemDesignRepository, systemDesignAi);

  container.registerInstance(AuthService, authService);
  container.registerInstance(UsersService, usersService);
  container.registerInstance(JobsService, jobsService);
  container.registerInstance(CandidatesService, candidatesService);
  container.registerInstance(CompaniesService, companiesService);
  container.registerInstance(InterviewSessionsService, interviewSessionsService);
  container.registerInstance(PortalService, portalService);
  container.registerInstance(SystemDesignProblemsService, systemDesignProblemsService);
  container.registerInstance(SystemDesignPortalService, systemDesignPortalService);

  // Presentation layer: controllers and routes (auto-injected).
  container.registerSingleton(AuthController);
  container.registerSingleton(UsersController);
  container.registerSingleton(JobsController);
  container.registerSingleton(CandidatesController);
  container.registerSingleton(CompaniesController);
  container.registerSingleton(InterviewSessionsController);
  container.registerSingleton(PortalController);
  container.registerSingleton(SystemDesignPortalController);
  container.registerSingleton(SystemDesignProblemsController);
  container.registerSingleton(AuthRoute);
  container.registerSingleton(UsersRoute);
  container.registerSingleton(JobsRoute);
  container.registerSingleton(CompaniesRoute);
  container.registerSingleton(PortalRoute);
  container.registerSingleton(SystemDesignProblemsRoute);

  isContainerInitialized = true;
}
