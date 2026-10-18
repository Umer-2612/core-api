import { container } from "tsyringe";
import type { CreateProblemDto, UpdateProblemDto } from "@modules/system-design-problems/system-design-problems.dto";
import type { ISystemDesignProblemsRepository } from "@modules/system-design-problems/system-design-problems.repository";
import { SystemDesignProblemsRepository } from "@modules/system-design-problems/system-design-problems.repository";
import { HttpException } from "@shared/exceptions/http.exception";
import type { PublicUser, SystemDesignProblem } from "@shared/interfaces/models.interface";

export class SystemDesignProblemsService {
  private readonly repository: ISystemDesignProblemsRepository;

  constructor(repository?: ISystemDesignProblemsRepository) {
    this.repository = repository ?? container.resolve(SystemDesignProblemsRepository);
  }

  /** hiring_manager only (enforced at the route), always owned by their own company. */
  public async create(data: CreateProblemDto, creator: PublicUser): Promise<SystemDesignProblem> {
    return this.repository.create({ ...data, company_id: creator.company_id, created_by: creator.id });
  }

  /** Global presets plus the viewer's own company's problems; a super_admin sees everything. */
  public async list(viewer: PublicUser): Promise<SystemDesignProblem[]> {
    return this.repository.findVisible(viewer.role === "super_admin" ? null : viewer.company_id);
  }

  /** 404 if it doesn't exist, 403 if it belongs to another company. Presets are visible to everyone. */
  public async getVisibleOrThrow(id: string, viewer: PublicUser): Promise<SystemDesignProblem> {
    const problem = await this.repository.findById(id);
    if (!problem) throw new HttpException(404, "System design problem not found");
    if (problem.company_id !== null && viewer.role !== "super_admin" && problem.company_id !== viewer.company_id) {
      throw new HttpException(403, "You do not have permission to view this problem");
    }
    return problem;
  }

  private async getEditableOrThrow(id: string, viewer: PublicUser): Promise<SystemDesignProblem> {
    const problem = await this.getVisibleOrThrow(id, viewer);
    if (problem.company_id === null) throw new HttpException(403, "Preset problems are read-only. Create your own problem instead");
    return problem;
  }

  /** Blocked once any candidate has opened an interview using it, so the prompt and target load
   * can't change underneath them mid-round. */
  public async update(id: string, data: UpdateProblemDto, viewer: PublicUser): Promise<SystemDesignProblem> {
    await this.getEditableOrThrow(id, viewer);
    if ((await this.repository.countRoundsUsing(id, true)) > 0) {
      throw new HttpException(409, "A candidate has already started an interview with this problem, so it can no longer be edited");
    }
    return this.repository.update(id, data);
  }

  /** Blocked while any interview references it (rounds point at it by id, deleting would orphan them). */
  public async remove(id: string, viewer: PublicUser): Promise<void> {
    await this.getEditableOrThrow(id, viewer);
    if ((await this.repository.countRoundsUsing(id, false)) > 0) {
      throw new HttpException(409, "This problem is assigned to an interview and can't be deleted");
    }
    await this.repository.delete(id);
  }
}
