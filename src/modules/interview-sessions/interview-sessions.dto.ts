import { z } from "zod";

export const createSessionSchema = z.object({
  scheduled_at: z.coerce.date().optional(),
});
export type CreateSessionDto = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "completed", "expired", "no_show"]).optional(),
  scheduled_at: z.coerce.date().optional(),
});
export type UpdateSessionDto = z.infer<typeof updateSessionSchema>;
