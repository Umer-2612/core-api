import { z } from "zod";

// POST /jobs/:id/candidates/:candidateId/interviews, hiring_manager only.
export const scheduleInterviewSchema = z.object({
  scheduled_at: z.string().datetime({ message: "scheduled_at must be an ISO 8601 datetime string" }),
  /** Optional: adds a fourth `system_design` round using this problem (a preset or the
   * hiring manager's own company's). Omit it for the usual three rounds. */
  system_design_problem_id: z.string().uuid().optional(),
});
export type ScheduleInterviewDto = z.infer<typeof scheduleInterviewSchema>;
