import "reflect-metadata";
import { container } from "tsyringe";
import { AuthController } from "@modules/auth/auth.controller";
import { AuthRoute } from "@modules/auth/auth.routes";
import { AuthService } from "@modules/auth/auth.service";
import { CompaniesRepository } from "@modules/companies/companies.repository";
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

  container.registerInstance(UsersRepository, usersRepository);
  container.registerInstance(CompaniesRepository, companiesRepository);

  // Business layer: services.
  const authService = new AuthService(usersRepository, companiesRepository);
  const usersService = new UsersService(usersRepository, companiesRepository);

  container.registerInstance(AuthService, authService);
  container.registerInstance(UsersService, usersService);

  // Presentation layer: controllers and routes (auto-injected).
  container.registerSingleton(AuthController);
  container.registerSingleton(UsersController);
  container.registerSingleton(AuthRoute);
  container.registerSingleton(UsersRoute);

  isContainerInitialized = true;
}
