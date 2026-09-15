import { Router } from "express";
import multer from "multer";
import { container, injectable } from "tsyringe";
import { CandidatesController } from "@modules/candidates/candidates.controller";
import { updateCandidateSchema } from "@modules/candidates/candidates.dto";
import { AuthMiddleware } from "@shared/middlewares/auth.middleware";
import { requireRole } from "@shared/middlewares/role.middleware";
import { ValidationMiddleware } from "@shared/middlewares/validation.middleware";
import type { Routes } from "@shared/interfaces/routes.interface";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Only PDF files are allowed"));
  },
});

@injectable()
export class CandidatesRoute implements Routes {
  public router: Router = Router({ mergeParams: true });
  public path = "/jobs/:jobId/candidates";
  private readonly candidatesController: CandidatesController;

  constructor() {
    this.candidatesController = container.resolve(CandidatesController);
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const canManage = requireRole("hiring_manager");

    this.router.get("/", AuthMiddleware, canManage, this.candidatesController.listByJob);
    this.router.get("/:candidateId", AuthMiddleware, canManage, this.candidatesController.getById);
    this.router.post("/", AuthMiddleware, canManage, upload.single("resume"), this.candidatesController.create);
    this.router.patch(
      "/:candidateId",
      AuthMiddleware,
      canManage,
      ValidationMiddleware(updateCandidateSchema),
      this.candidatesController.update,
    );
    this.router.delete("/:candidateId", AuthMiddleware, canManage, this.candidatesController.remove);
  }
}
