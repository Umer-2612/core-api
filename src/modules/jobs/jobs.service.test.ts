import { beforeEach, describe, expect, it } from "vitest";
import type { CreateJobData, IJobsRepository } from "@modules/jobs/jobs.repository";
import { JobsService } from "@modules/jobs/jobs.service";
import type { Job, PublicUser } from "@shared/interfaces/models.interface";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    company_id: "company-1",
    title: "Backend Engineer",
    description: "Build the API",
    created_by: "hm-1",
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "hm-1",
    company_id: "company-1",
    full_name: "Jane HM",
    email: "jane@acme.com",
    role: "hiring_manager",
    status: "active",
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

class FakeJobsRepository implements IJobsRepository {
  jobs: Job[] = [];
  async findById(id: string) {
    return this.jobs.find((j) => j.id === id) ?? null;
  }
  async findByCompany(companyId: string) {
    return this.jobs.filter((j) => j.company_id === companyId);
  }
  async findAll() {
    return this.jobs;
  }
  async create(data: CreateJobData) {
    const job = makeJob({ id: `job-${this.jobs.length + 1}`, ...data });
    this.jobs.push(job);
    return job;
  }
}

describe("JobsService", () => {
  let jobs: FakeJobsRepository;
  let service: JobsService;

  beforeEach(() => {
    jobs = new FakeJobsRepository();
    service = new JobsService(jobs);
  });

  describe("create", () => {
    it("scopes the new job to the creator's own company", async () => {
      const hiringManager = makeUser();
      const job = await service.create({ title: "Backend Engineer", description: "Build the API" }, hiringManager);

      expect(job.company_id).toBe("company-1");
      expect(job.created_by).toBe("hm-1");
    });
  });

  describe("list", () => {
    it("super admin sees every company's jobs", async () => {
      jobs.jobs.push(makeJob({ id: "j1", company_id: "company-1" }), makeJob({ id: "j2", company_id: "company-2" }));
      const superAdmin = makeUser({ role: "super_admin" });

      const result = await service.list(superAdmin);
      expect(result).toHaveLength(2);
    });

    it("hiring manager sees only their own company's jobs", async () => {
      jobs.jobs.push(makeJob({ id: "j1", company_id: "company-1" }), makeJob({ id: "j2", company_id: "company-2" }));
      const hiringManager = makeUser({ company_id: "company-1" });

      const result = await service.list(hiringManager);
      expect(result).toHaveLength(1);
      expect(result[0]?.company_id).toBe("company-1");
    });
  });

  describe("getVisibleOrThrow", () => {
    it("404s for an unknown job", async () => {
      await expect(service.getVisibleOrThrow("ghost", makeUser())).rejects.toMatchObject({ status: 404 });
    });

    it("403s a hiring manager viewing another company's job", async () => {
      jobs.jobs.push(makeJob({ company_id: "company-2" }));
      await expect(service.getVisibleOrThrow("job-1", makeUser({ company_id: "company-1" }))).rejects.toMatchObject({
        status: 403,
      });
    });

    it("lets a super admin view any company's job", async () => {
      jobs.jobs.push(makeJob({ company_id: "company-2" }));
      const job = await service.getVisibleOrThrow("job-1", makeUser({ role: "super_admin" }));
      expect(job.id).toBe("job-1");
    });
  });
});
