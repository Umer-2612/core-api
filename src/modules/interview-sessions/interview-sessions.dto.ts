import { z } from "zod";

// POST /jobs/:id/candidates/:candidateId/interviews, hiring_manager only.
export const scheduleInterviewSchema = z.object({
  scheduled_at: z.string().datetime({ message: "scheduled_at must be an ISO 8601 datetime string" }),
});
export type ScheduleInterviewDto = z.infer<typeof scheduleInterviewSchema>;
