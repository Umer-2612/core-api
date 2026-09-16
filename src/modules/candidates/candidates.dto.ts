import { z } from "zod";

export const updateCandidateSchema = z.object({
  status: z
    .enum(["uploaded", "invited", "scheduled", "interviewed", "analysed", "shortlisted", "rejected", "no_show"])
    .optional(),
});

export type UpdateCandidateDto = z.infer<typeof updateCandidateSchema>;
