-- AlterEnum
ALTER TYPE "InterviewRoundType" ADD VALUE 'system_design';

-- AlterTable
ALTER TABLE "interview_rounds" ADD COLUMN     "board" JSONB,
ADD COLUMN     "simulation_runs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "system_design_problem_id" TEXT;

-- CreateTable
CREATE TABLE "system_design_problems" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "created_by" TEXT,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'medium',
    "requirements" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_design_problems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_design_problems_company_id_idx" ON "system_design_problems"("company_id");
