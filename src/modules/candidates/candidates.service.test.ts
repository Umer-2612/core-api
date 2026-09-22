import { beforeEach, describe, expect, it } from "vitest";
import {
  toJsonValue,
  type CreateCandidateProfileData,
  type ICandidateProfileRepository,
} from "@modules/candidates/candidate-profile.repository";
import type { CreateCandidateData, ICandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesService } from "@modules/candidates/candidates.service";
import type { IResumeStorage } from "@modules/candidates/resume-storage";
import type { CreateJobData, IJobsRepository } from "@modules/jobs/jobs.repository";
import { JobsService } from "@modules/jobs/jobs.service";
import type { Candidate, CandidateProfile, Job, PublicUser } from "@shared/interfaces/models.interface";

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
    email: null,
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

function makeProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: "profile-1",
    candidate_id: "candidate-1",
    phone: null,
    summary: null,
    skills: [],
    experience: [],
    education: [],
    sections: [],
    links: [],
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

class FakeCandidateProfileRepository implements ICandidateProfileRepository {
  profiles: CandidateProfile[] = [];
  async findByCandidateId(candidateId: string) {
    return this.profiles.find((p) => p.candidate_id === candidateId) ?? null;
  }
  async create(data: CreateCandidateProfileData) {
    const profile = makeProfile({
      id: `profile-${this.profiles.length + 1}`,
      ...data,
      skills: toJsonValue(data.skills) as CandidateProfile["skills"],
      experience: toJsonValue(data.experience) as CandidateProfile["experience"],
      education: toJsonValue(data.education) as CandidateProfile["education"],
      sections: toJsonValue(data.sections) as CandidateProfile["sections"],
      links: toJsonValue(data.links) as CandidateProfile["links"],
    });
    this.profiles.push(profile);
    return profile;
  }
}

describe("CandidatesService", () => {
  let jobsRepo: FakeJobsRepository;
  let candidatesRepo: FakeCandidatesRepository;
  let storage: FakeResumeStorage;
  let profilesRepo: FakeCandidateProfileRepository;
  let service: CandidatesService;

  beforeEach(() => {
    jobsRepo = new FakeJobsRepository();
    candidatesRepo = new FakeCandidatesRepository();
    storage = new FakeResumeStorage();
    profilesRepo = new FakeCandidateProfileRepository();
    jobsRepo.jobs.push(makeJob());
    service = new CandidatesService(candidatesRepo, new JobsService(jobsRepo), storage, profilesRepo);
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

    it("still creates a candidate and an empty profile when the PDF can't be parsed", async () => {
      // makeFile's buffer isn't a real PDF, extraction fails and falls back
      // rather than failing the whole upload.
      const result = await service.uploadResumes("job-1", [makeFile()], makeUser());

      expect(result).toHaveLength(1);
      expect(profilesRepo.profiles).toHaveLength(1);
      expect(profilesRepo.profiles[0]).toMatchObject({ phone: null, summary: null, skills: [], experience: [] });
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

  describe("getByIdOrThrow", () => {
    it("returns the candidate without the resume key", async () => {
      candidatesRepo.candidates.push(makeCandidate({ full_name: "Jane Doe", email: "jane@acme.com" }));

      const candidate = await service.getByIdOrThrow("job-1", "candidate-1", makeUser());

      expect(candidate.full_name).toBe("Jane Doe");
      expect(candidate.email).toBe("jane@acme.com");
      expect(candidate).not.toHaveProperty("resume_key");
    });

    it("404s when the candidate belongs to a different job", async () => {
      jobsRepo.jobs.push(makeJob({ id: "job-2" }));
      candidatesRepo.candidates.push(makeCandidate({ job_id: "job-2" }));
      await expect(service.getByIdOrThrow("job-1", "candidate-1", makeUser())).rejects.toMatchObject({ status: 404 });
    });

    it("403s a hiring manager viewing another company's candidate", async () => {
      jobsRepo.jobs.push(makeJob({ id: "job-2", company_id: "company-2" }));
      candidatesRepo.candidates.push(makeCandidate({ job_id: "job-2" }));
      await expect(service.getByIdOrThrow("job-2", "candidate-1", makeUser())).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("getProfileOrThrow", () => {
    it("returns the candidate's extracted profile", async () => {
      candidatesRepo.candidates.push(makeCandidate());
      profilesRepo.profiles.push(
        makeProfile({ phone: "555-0132", skills: [{ category: "", items: ["TypeScript"] }] }),
      );

      const profile = await service.getProfileOrThrow("job-1", "candidate-1", makeUser());

      expect(profile.phone).toBe("555-0132");
      expect(profile.skills).toEqual([{ category: "", items: ["TypeScript"] }]);
    });

    it("404s when the candidate has no profile row", async () => {
      candidatesRepo.candidates.push(makeCandidate());
      await expect(service.getProfileOrThrow("job-1", "candidate-1", makeUser())).rejects.toMatchObject({ status: 404 });
    });

    it("403s a hiring manager viewing another company's candidate", async () => {
      jobsRepo.jobs.push(makeJob({ id: "job-2", company_id: "company-2" }));
      candidatesRepo.candidates.push(makeCandidate({ job_id: "job-2" }));
      profilesRepo.profiles.push(makeProfile());

      await expect(service.getProfileOrThrow("job-2", "candidate-1", makeUser())).rejects.toMatchObject({ status: 403 });
    });
  });
});
