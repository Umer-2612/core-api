import { toJsonValue } from "@modules/candidates/candidate-profile.repository";
import type { CreateProblemDto, UpdateProblemDto } from "@modules/system-design-problems/system-design-problems.dto";
import type { SystemDesignProblem } from "@shared/interfaces/models.interface";
import { prisma } from "@/db/prisma";

export interface ISystemDesignProblemsRepository {
  /** Global presets plus the company's own problems; every company's when `companyId` is null. */
  findVisible(companyId: string | null): Promise<SystemDesignProblem[]>;
  findById(id: string): Promise<SystemDesignProblem | null>;
  create(data: CreateProblemDto & { company_id: string; created_by: string }): Promise<SystemDesignProblem>;
  update(id: string, data: UpdateProblemDto): Promise<SystemDesignProblem>;
  delete(id: string): Promise<void>;
  /** Rounds that reference the problem; `startedOnly` counts just the ones a candidate has opened. */
  countRoundsUsing(problemId: string, startedOnly: boolean): Promise<number>;
}

/** Data access for the `system_design_problems` table (Prisma / Postgres). */
export class SystemDesignProblemsRepository implements ISystemDesignProblemsRepository {
  async findVisible(companyId: string | null): Promise<SystemDesignProblem[]> {
    return prisma.systemDesignProblem.findMany({
      where: companyId === null ? undefined : { OR: [{ company_id: null }, { company_id: companyId }] },
      orderBy: [{ created_at: "asc" }, { title: "asc" }],
    });
  }

  async findById(id: string): Promise<SystemDesignProblem | null> {
    return prisma.systemDesignProblem.findUnique({ where: { id } });
  }

  async create(data: CreateProblemDto & { company_id: string; created_by: string }): Promise<SystemDesignProblem> {
    return prisma.systemDesignProblem.create({ data: { ...data, requirements: toJsonValue(data.requirements) } });
  }

  async update(id: string, data: UpdateProblemDto): Promise<SystemDesignProblem> {
    const { requirements, ...rest } = data;
    return prisma.systemDesignProblem.update({
      where: { id },
      data: { ...rest, ...(requirements ? { requirements: toJsonValue(requirements) } : {}) },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.systemDesignProblem.delete({ where: { id } });
  }

  async countRoundsUsing(problemId: string, startedOnly: boolean): Promise<number> {
    return prisma.interviewRound.count({
      where: { system_design_problem_id: problemId, ...(startedOnly ? { started_at: { not: null } } : {}) },
    });
  }
}
