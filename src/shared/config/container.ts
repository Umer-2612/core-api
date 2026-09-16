import "reflect-metadata";
import { container } from "tsyringe";
import { AuthController } from "@modules/auth/auth.controller";
import { AuthRoute } from "@modules/auth/auth.routes";
import { AuthService } from "@modules/auth/auth.service";
import { CandidatesController } from "@modules/candidates/candidates.controller";
import { CandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesRoute } from "@modules/candidates/candidates.routes";
import { CandidatesService } from "@modules/candidates/candidates.service";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import { EmailService } from "@modules/email/email.service";
import { InterviewSessionsController } from "@modules/interview-sessions/interview-sessions.controller";
import { InterviewSessionsRepository } from "@modules/interview-sessions/interview-sessions.repository";
import { InterviewSessionsRoute } from "@modules/interview-sessions/interview-sessions.routes";
import { InterviewSessionsService } from "@modules/interview-sessions/interview-sessions.service";
import { SessionsRoute } from "@modules/interview-sessions/sessions.routes";
import { InvitationsController } from "@modules/invitations/invitations.controller";
import { InvitationsRepository } from "@modules/invitations/invitations.repository";
import { InvitationsRoute } from "@modules/invitations/invitations.routes";
import { InvitationsService } from "@modules/invitations/invitations.service";
import { JobsController } from "@modules/jobs/jobs.controller";
import { JobsRepository } from "@modules/jobs/jobs.repository";
import { JobsRoute } from "@modules/jobs/jobs.routes";
import { JobsService } from "@modules/jobs/jobs.service";
import { UsersRepository } from "@modules/users/users.repository";

let isContainerInitialized = false;

export function setupContainer() {
  if (isContainerInitialized) return;

  // Infrastructure layer: repositories.
  const usersRepository = new UsersRepository();
  const companiesRepository = new CompaniesRepository();
  const invitationsRepository = new InvitationsRepository();
  const jobsRepository = new JobsRepository();
  const candidatesRepository = new CandidatesRepository();
  const sessionsRepository = new InterviewSessionsRepository();

  container.registerInstance(UsersRepository, usersRepository);
  container.registerInstance(CompaniesRepository, companiesRepository);
  container.registerInstance(InvitationsRepository, invitationsRepository);
  container.registerInstance(JobsRepository, jobsRepository);
  container.registerInstance(CandidatesRepository, candidatesRepository);
  container.registerInstance(InterviewSessionsRepository, sessionsRepository);

  // Business layer: services.
  const emailService = new EmailService();
  const authService = new AuthService(usersRepository, invitationsRepository);
  const invitationsService = new InvitationsService(
    invitationsRepository,
    usersRepository,
    companiesRepository,
    emailService,
  );
  const jobsService = new JobsService(jobsRepository);
  const candidatesService = new CandidatesService(candidatesRepository, jobsRepository);
  const sessionsService = new InterviewSessionsService(sessionsRepository, candidatesRepository, jobsRepository);

  container.registerInstance(EmailService, emailService);
  container.registerInstance(AuthService, authService);
  container.registerInstance(InvitationsService, invitationsService);
  container.registerInstance(JobsService, jobsService);
  container.registerInstance(CandidatesService, candidatesService);
  container.registerInstance(InterviewSessionsService, sessionsService);

  // Presentation layer: controllers and routes (auto-injected).
  container.registerSingleton(AuthController);
  container.registerSingleton(InvitationsController);
  container.registerSingleton(JobsController);
  container.registerSingleton(CandidatesController);
  container.registerSingleton(InterviewSessionsController);
  container.registerSingleton(AuthRoute);
  container.registerSingleton(InvitationsRoute);
  container.registerSingleton(JobsRoute);
  container.registerSingleton(CandidatesRoute);
  container.registerSingleton(InterviewSessionsRoute);
  container.registerSingleton(SessionsRoute);

  isContainerInitialized = true;
}
