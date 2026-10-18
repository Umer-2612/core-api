import { beforeEach, describe, expect, it } from "vitest";
import type { CreateProblemDto, UpdateProblemDto } from "@modules/system-design-problems/system-design-problems.dto";
import type { ISystemDesignProblemsRepository } from "@modules/system-design-problems/system-design-problems.repository";
import { SystemDesignProblemsService } from "@modules/system-design-problems/system-design-problems.service";
import type { PublicUser, SystemDesignProblem } from "@shared/interfaces/models.interface";

const REQUIREMENTS = { target_rps: 1000, read_ratio: 0.9, peak_multiplier: 2, data_size_gb: 10, latency_slo_ms: 200, availability_slo: 99.9 };

function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return { id: "hm-1", company_id: "company-1", full_name: "HM", email: "hm@acme.com", role: "hiring_manager", status: "active", created_at: new Date(), ...overrides };
}

function makeProblem(overrides: Partial<SystemDesignProblem> = {}): SystemDesignProblem {
  return { id: "p-1", company_id: "company-1", created_by: "hm-1", title: "Mine", prompt: "x", difficulty: "medium", requirements: REQUIREMENTS, created_at: new Date(), ...overrides };
}

class FakeRepo implements ISystemDesignProblemsRepository {
  problems: SystemDesignProblem[] = [];
  /** problem id -> [rounds assigned, rounds started] */
  usage = new Map<string, [number, number]>();
  async findVisible(companyId: string | null) {
    return this.problems.filter((p) => companyId === null || p.company_id === null || p.company_id === companyId);
  }
  async findById(id: string) {
    return this.problems.find((p) => p.id === id) ?? null;
  }
  async create(data: CreateProblemDto & { company_id: string; created_by: string }) {
    const problem = makeProblem({ id: `p-${this.problems.length + 1}`, ...data });
    this.problems.push(problem);
    return problem;
  }
  async update(id: string, data: UpdateProblemDto) {
    const problem = this.problems.find((p) => p.id === id)!;
    Object.assign(problem, data);
    return problem;
  }
  async delete(id: string) {
    this.problems = this.problems.filter((p) => p.id !== id);
  }
  async countRoundsUsing(problemId: string, startedOnly: boolean) {
    const [assigned, started] = this.usage.get(problemId) ?? [0, 0];
    return startedOnly ? started : assigned;
  }
}

describe("SystemDesignProblemsService", () => {
  let repo: FakeRepo;
  let service: SystemDesignProblemsService;

  beforeEach(() => {
    repo = new FakeRepo();
    repo.problems.push(
      makeProblem({ id: "preset", company_id: null, created_by: null, title: "Preset" }),
      makeProblem({ id: "mine", company_id: "company-1" }),
      makeProblem({ id: "theirs", company_id: "company-2", title: "Theirs" }),
    );
    service = new SystemDesignProblemsService(repo);
  });

  it("creates a problem owned by the caller's company", async () => {
    const created = await service.create({ title: "New", prompt: "p", difficulty: "hard", requirements: REQUIREMENTS }, makeUser());
    expect(created.company_id).toBe("company-1");
    expect(created.created_by).toBe("hm-1");
  });

  it("lists presets plus own company's problems; a super_admin sees all", async () => {
    expect((await service.list(makeUser())).map((p) => p.id).sort()).toEqual(["mine", "preset"]);
    expect(await service.list(makeUser({ role: "super_admin" }))).toHaveLength(3);
  });

  it("hides other companies' problems but shows presets", async () => {
    await expect(service.getVisibleOrThrow("theirs", makeUser())).rejects.toMatchObject({ status: 403 });
    await expect(service.getVisibleOrThrow("nope", makeUser())).rejects.toMatchObject({ status: 404 });
    expect((await service.getVisibleOrThrow("preset", makeUser())).id).toBe("preset");
  });

  it("keeps presets read-only", async () => {
    await expect(service.update("preset", { title: "x" }, makeUser())).rejects.toMatchObject({ status: 403 });
    await expect(service.remove("preset", makeUser())).rejects.toMatchObject({ status: 403 });
  });

  it("updates an unused problem", async () => {
    expect((await service.update("mine", { title: "Renamed" }, makeUser())).title).toBe("Renamed");
  });

  it("blocks editing once a candidate has started, but allows it while only scheduled", async () => {
    repo.usage.set("mine", [1, 0]);
    await expect(service.update("mine", { title: "ok" }, makeUser())).resolves.toBeDefined();
    repo.usage.set("mine", [1, 1]);
    await expect(service.update("mine", { title: "no" }, makeUser())).rejects.toMatchObject({ status: 409 });
  });

  it("blocks deleting a problem any interview references", async () => {
    repo.usage.set("mine", [1, 0]);
    await expect(service.remove("mine", makeUser())).rejects.toMatchObject({ status: 409 });
    repo.usage.set("mine", [0, 0]);
    await service.remove("mine", makeUser());
    expect(repo.problems.find((p) => p.id === "mine")).toBeUndefined();
  });

  it("refuses editing another company's problem", async () => {
    await expect(service.update("theirs", { title: "x" }, makeUser())).rejects.toMatchObject({ status: 403 });
  });
});
