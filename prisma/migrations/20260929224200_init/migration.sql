-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'hiring_manager');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending_verification', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "InterviewSessionStatus" AS ENUM ('scheduled', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "InterviewRoundType" AS ENUM ('dsa', 'vscode', 'technical_ai');

-- CreateEnum
CREATE TYPE "InterviewRoundStatus" AS ENUM ('pending', 'completed');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "invited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "resume_file_name" TEXT NOT NULL,
    "resume_key" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "InterviewSessionStatus" NOT NULL DEFAULT 'scheduled',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_rounds" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "round_type" "InterviewRoundType" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "InterviewRoundStatus" NOT NULL DEFAULT 'pending',
    "question_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3),
    "submissions" JSONB,
    "focus_loss_events" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "starter_code" JSONB NOT NULL,
    "test_cases" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "phone" TEXT,
    "summary" TEXT,
    "skills" JSONB NOT NULL,
    "experience" JSONB NOT NULL,
    "education" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "links" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE INDEX "jobs_company_id_idx" ON "jobs"("company_id");

-- CreateIndex
CREATE INDEX "candidates_job_id_idx" ON "candidates"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_sessions_candidate_id_key" ON "interview_sessions"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_sessions_access_token_key" ON "interview_sessions"("access_token");

-- CreateIndex
CREATE INDEX "interview_sessions_job_id_idx" ON "interview_sessions"("job_id");

-- CreateIndex
CREATE INDEX "interview_rounds_session_id_idx" ON "interview_rounds"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_candidate_id_key" ON "candidate_profiles"("candidate_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_rounds" ADD CONSTRAINT "interview_rounds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

