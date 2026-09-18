import { Router } from "express";
import { container, injectable } from "tsyringe";
import { CandidatesController } from "@modules/candidates/candidates.controller";
import { createJobSchema } from "@modules/jobs/jobs.dto";
import { JobsController } from "@modules/jobs/jobs.controller";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { UploadResumes } from "@shared/middlewares/upload.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

@injectable()
export class JobsRoute implements Routes {
  public router: Router = Router();
  public path = "/jobs";
  private readonly jobsController: JobsController;
  private readonly candidatesController: CandidatesController;

  constructor() {
    this.jobsController = container.resolve(JobsController);
    this.candidatesController = container.resolve(CandidatesController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/", AuthMiddleware, requireRole("super_admin", "hiring_manager"), this.jobsController.list);
    this.router.post(
      "/",
      AuthMiddleware,
      requireRole("hiring_manager"),
      ValidationMiddleware(createJobSchema),
      this.jobsController.create,
    );
    this.router.get("/:id", AuthMiddleware, requireRole("super_admin", "hiring_manager"), this.jobsController.getById);

    this.router.get(
      "/:id/candidates",
      AuthMiddleware,
      requireRole("super_admin", "hiring_manager"),
      this.candidatesController.list,
    );
    this.router.post(
      "/:id/candidates",
      AuthMiddleware,
      requireRole("hiring_manager"),
      UploadResumes,
      this.candidatesController.upload,
    );
    this.router.get(
      "/:id/candidates/:candidateId/resume",
      AuthMiddleware,
      requireRole("super_admin", "hiring_manager"),
      this.candidatesController.downloadResume,
    );
    this.router.get(
      "/:id/candidates/:candidateId/profile",
      AuthMiddleware,
      requireRole("super_admin", "hiring_manager"),
      this.candidatesController.getProfile,
    );
  }
}
