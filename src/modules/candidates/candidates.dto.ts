import { z } from "zod";

export const updateCandidateSchema = z.object({
  status: z.enum(["uploaded", "scheduled", "interviewed", "rejected", "no_show"]).optional(),
});

export type UpdateCandidateDto = z.infer<typeof updateCandidateSchema>;
