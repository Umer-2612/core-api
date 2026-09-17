import { beforeEach, describe, expect, it } from "vitest";
import type { CreateCandidateData, ICandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesService } from "@modules/candidates/candidates.service";
import type { IResumeStorage } from "@modules/candidates/resume-storage";
import type { CreateJobData, IJobsRepository } from "@modules/jobs/jobs.repository";
import { JobsService } from "@modules/jobs/jobs.service";
import type { Candidate, Job, PublicUser } from "@shared/interfaces/models.interface";

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

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "candidate-1",
    job_id: "job-1",
    full_name: "Jane Doe",
    resume_file_name: "jane-doe.pdf",
    resume_key: "resumes/job-1/candidate-1-jane-doe.pdf",
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

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: "jane-doe_resume.pdf",
    buffer: Buffer.from("pdf-bytes"),
    ...overrides,
  } as Express.Multer.File;
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

class FakeCandidatesRepository implements ICandidatesRepository {
  candidates: Candidate[] = [];
  async findById(id: string) {
    return this.candidates.find((c) => c.id === id) ?? null;
  }
  async findByJob(jobId: string) {
    return this.candidates.filter((c) => c.job_id === jobId);
  }
  async create(data: CreateCandidateData) {
    const candidate = makeCandidate(data);
    this.candidates.push(candidate);
    return candidate;
  }
}

/** In-memory stand-in for S3: a Map keyed by object key. */
class FakeResumeStorage implements IResumeStorage {
  objects = new Map<string, Buffer>();
  async upload(key: string, body: Buffer) {
    this.objects.set(key, body);
  }
  async download(key: string) {
    const buffer = this.objects.get(key);
    if (!buffer) throw new Error(`no object at ${key}`);
    return buffer;
  }
}

describe("CandidatesService", () => {
  let jobsRepo: FakeJobsRepository;
  let candidatesRepo: FakeCandidatesRepository;
  let storage: FakeResumeStorage;
  let service: CandidatesService;

  beforeEach(() => {
    jobsRepo = new FakeJobsRepository();
    candidatesRepo = new FakeCandidatesRepository();
    storage = new FakeResumeStorage();
    jobsRepo.jobs.push(makeJob());
    service = new CandidatesService(candidatesRepo, new JobsService(jobsRepo), storage);
  });

  describe("uploadResumes", () => {
    it("derives full_name from the file name, uploads to storage, and stores the key", async () => {
      const hiringManager = makeUser();
      const files = [makeFile({ originalname: "jane-doe_resume.pdf" })];

      const result = await service.uploadResumes("job-1", files, hiringManager);

      expect(result).toHaveLength(1);
      expect(result[0]?.full_name).toBe("Jane Doe Resume");
      expect(result[0]?.resume_file_name).toBe("jane-doe_resume.pdf");
      expect(result[0]).not.toHaveProperty("resume_key");
      expect(storage.objects.size).toBe(1);
    });

    it("403s uploading to another company's job", async () => {
      const outsider = makeUser({ id: "hm-2", company_id: "company-2" });
      await expect(service.uploadResumes("job-1", [makeFile()], outsider)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("listByJob", () => {
    it("lists candidates without their resume key", async () => {
      candidatesRepo.candidates.push(makeCandidate());
      const result = await service.listByJob("job-1", makeUser());
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("resume_key");
    });
  });

  describe("getResumeOrThrow", () => {
    it("fetches the resume bytes from storage by the candidate's key", async () => {
      candidatesRepo.candidates.push(makeCandidate({ resume_key: "resumes/job-1/candidate-1-jane-doe.pdf" }));
      storage.objects.set("resumes/job-1/candidate-1-jane-doe.pdf", Buffer.from("pdf-bytes"));

      const resume = await service.getResumeOrThrow("job-1", "candidate-1", makeUser());

      expect(resume.fileName).toBe("jane-doe.pdf");
      expect(resume.buffer.toString()).toBe("pdf-bytes");
    });

    it("404s when the candidate belongs to a different job", async () => {
      jobsRepo.jobs.push(makeJob({ id: "job-2" }));
      candidatesRepo.candidates.push(makeCandidate({ job_id: "job-2" }));
      await expect(service.getResumeOrThrow("job-1", "candidate-1", makeUser())).rejects.toMatchObject({ status: 404 });
    });
  });
});
