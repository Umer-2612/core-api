import { z } from "zod";

// POST /jobs, hiring_manager only.
export const createJobSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }).max(200),
  description: z.string().min(1, { message: "Description is required" }).max(5000),
});
export type CreateJobDto = z.infer<typeof createJobSchema>;
