import { z } from "zod";

// POST /jobs, hiring_manager only. description is rich-text HTML from the
// frontend's editor, not plain text, hence the higher length cap.
export const createJobSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }).max(200),
  description: z.string().min(1, { message: "Description is required" }).max(20000),
});
export type CreateJobDto = z.infer<typeof createJobSchema>;
