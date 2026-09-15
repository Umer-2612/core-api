import { z } from "zod";

export const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  jd_raw_text: z.string().min(1).optional(),
});

export const updateJobSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  jd_raw_text: z.string().min(1).optional(),
  status: z.enum(["active", "done"]).optional(),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;
export type UpdateJobDto = z.infer<typeof updateJobSchema>;
