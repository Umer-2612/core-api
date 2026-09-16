import "reflect-metadata";
import { container } from "tsyringe";
import { AuthController } from "@modules/auth/auth.controller";
import { AuthRoute } from "@modules/auth/auth.routes";
import { AuthService } from "@modules/auth/auth.service";
import { CompaniesRepository } from "@modules/companies/companies.repository";
import { EmailService } from "@modules/email/email.service";
import { InvitationsController } from "@modules/invitations/invitations.controller";
import { InvitationsRepository } from "@modules/invitations/invitations.repository";
import { InvitationsRoute } from "@modules/invitations/invitations.routes";
import { InvitationsService } from "@modules/invitations/invitations.service";
import { UsersRepository } from "@modules/users/users.repository";

let isContainerInitialized = false;

export function setupContainer() {
  if (isContainerInitialized) return;

  // Infrastructure layer: repositories.
  const usersRepository = new UsersRepository();
  const companiesRepository = new CompaniesRepository();
  const invitationsRepository = new InvitationsRepository();

  container.registerInstance(UsersRepository, usersRepository);
  container.registerInstance(CompaniesRepository, companiesRepository);
  container.registerInstance(InvitationsRepository, invitationsRepository);

  // Business layer: services.
  const emailService = new EmailService();
  const authService = new AuthService(usersRepository, invitationsRepository);
  const invitationsService = new InvitationsService(
    invitationsRepository,
    usersRepository,
    companiesRepository,
    emailService,
  );

  container.registerInstance(EmailService, emailService);
  container.registerInstance(AuthService, authService);
  container.registerInstance(InvitationsService, invitationsService);

  // Presentation layer: controllers and routes (auto-injected).
  container.registerSingleton(AuthController);
  container.registerSingleton(InvitationsController);
  container.registerSingleton(AuthRoute);
  container.registerSingleton(InvitationsRoute);

  isContainerInitialized = true;
}
