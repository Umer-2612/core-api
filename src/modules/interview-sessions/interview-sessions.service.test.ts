import { beforeEach, describe, expect, it } from "vitest";
import type { ICandidateProfileRepository } from "@modules/candidates/candidate-profile.repository";
import type { CreateCandidateData, ICandidatesRepository } from "@modules/candidates/candidates.repository";
import { CandidatesService } from "@modules/candidates/candidates.service";
import type { IResumeStorage } from "@modules/candidates/resume-storage";
import type {
  CreateInterviewSessionData,
  IInterviewSessionsRepository,
} from "@modules/interview-sessions/interview-sessions.repository";
import { InterviewSessionsService } from "@modules/interview-sessions/interview-sessions.service";
import type { CreateJobData, IJobsRepository } from "@modules/jobs/jobs.repository";
import { JobsService } from "@modules/jobs/jobs.service";
import type { Candidate, InterviewSessionWithRounds, Job, PublicUser } from "@shared/interfaces/models.interface";

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

function makeSession(overrides: Partial<InterviewSessionWithRounds> = {}): InterviewSessionWithRounds {
  return {
    id: "session-1",
    job_id: "job-1",
    candidate_id: "candidate-1",
    scheduled_at: new Date("2026-02-01T10:00:00Z"),
    status: "scheduled",
    created_by: "hm-1",
    created_at: new Date("2026-01-01T00:00:00Z"),
    rounds: [
      { id: "round-1", session_id: "session-1", round_type: "dsa", sequence: 1, status: "pending", created_at: new Date() },
      {
        id: "round-2",
        session_id: "session-1",
        round_type: "vscode",
        sequence: 2,
        status: "pending",
        created_at: new Date(),
      },
      {
        id: "round-3",
        session_id: "session-1",
        round_type: "technical_ai",
        sequence: 3,
        status: "pending",
        created_at: new Date(),
      },
    ],
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

/** CandidatesService needs these too, unused by anything these tests exercise. */
class UnusedResumeStorage implements IResumeStorage {
  async upload(): Promise<void> {
    throw new Error("not used in these tests");
  }
  async download(): Promise<Buffer> {
    throw new Error("not used in these tests");
  }
}
class UnusedCandidateProfileRepository implements ICandidateProfileRepository {
  async findByCandidateId() {
    return null;
  }
  async create(): Promise<never> {
    throw new Error("not used in these tests");
  }
}

class FakeInterviewSessionsRepository implements IInterviewSessionsRepository {
  sessions: InterviewSessionWithRounds[] = [];
  async findById(id: string) {
    return this.sessions.find((s) => s.id === id) ?? null;
  }
  async findByCandidate(candidateId: string) {
    return this.sessions.filter((s) => s.candidate_id === candidateId);
  }
  async create(data: CreateInterviewSessionData) {
    const session = makeSession({ id: `session-${this.sessions.length + 1}`, ...data });
    this.sessions.push(session);
    return session;
  }
}

describe("InterviewSessionsService", () => {
  let jobsRepo: FakeJobsRepository;
  let candidatesRepo: FakeCandidatesRepository;
  let sessionsRepo: FakeInterviewSessionsRepository;
  let service: InterviewSessionsService;

  beforeEach(() => {
    jobsRepo = new FakeJobsRepository();
    candidatesRepo = new FakeCandidatesRepository();
    sessionsRepo = new FakeInterviewSessionsRepository();
    jobsRepo.jobs.push(makeJob());
    candidatesRepo.candidates.push(makeCandidate());

    const jobsService = new JobsService(jobsRepo);
    const candidatesService = new CandidatesService(
      candidatesRepo,
      jobsService,
      new UnusedResumeStorage(),
      new UnusedCandidateProfileRepository(),
    );
    service = new InterviewSessionsService(sessionsRepo, candidatesService);
  });

  describe("schedule", () => {
    it("creates a session with three rounds for a candidate in the caller's own company", async () => {
      const session = await service.schedule(
        "job-1",
        "candidate-1",
        { scheduled_at: "2026-02-01T10:00:00Z" },
        makeUser(),
      );

      expect(session.job_id).toBe("job-1");
      expect(session.candidate_id).toBe("candidate-1");
      expect(session.rounds.map((r) => r.round_type)).toEqual(["dsa", "vscode", "technical_ai"]);
    });

    it("403s scheduling for a candidate in another company's job", async () => {
      const outsider = makeUser({ id: "hm-2", company_id: "company-2" });
      await expect(
        service.schedule("job-1", "candidate-1", { scheduled_at: "2026-02-01T10:00:00Z" }, outsider),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("404s scheduling for a candidate that belongs to a different job", async () => {
      jobsRepo.jobs.push(makeJob({ id: "job-2" }));
      candidatesRepo.candidates.push(makeCandidate({ id: "candidate-2", job_id: "job-2" }));

      await expect(
        service.schedule("job-1", "candidate-2", { scheduled_at: "2026-02-01T10:00:00Z" }, makeUser()),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("listByCandidate", () => {
    it("lists sessions scheduled for that candidate", async () => {
      sessionsRepo.sessions.push(makeSession());
      const result = await service.listByCandidate("job-1", "candidate-1", makeUser());
      expect(result).toHaveLength(1);
      expect(result[0]?.rounds).toHaveLength(3);
    });

    it("403s a hiring manager from another company", async () => {
      const outsider = makeUser({ id: "hm-2", company_id: "company-2" });
      await expect(service.listByCandidate("job-1", "candidate-1", outsider)).rejects.toMatchObject({ status: 403 });
    });
  });
});
