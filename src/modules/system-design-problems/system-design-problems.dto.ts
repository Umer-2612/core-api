import { z } from "zod";
import { requirementsSchema } from "@modules/portal/system-design/schemas";

const difficulty = z.enum(["easy", "medium", "hard"]);

// POST /system-design-problems, hiring_manager only.
export const createProblemSchema = z.object({
  title: z.string().trim().min(1, { message: "Title is required" }).max(200),
  prompt: z.string().trim().min(1, { message: "Prompt is required" }).max(8000),
  difficulty,
  requirements: requirementsSchema,
});
export type CreateProblemDto = z.infer<typeof createProblemSchema>;

// PATCH /system-design-problems/:id, hiring_manager only. Any subset of the create fields.
export const updateProblemSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    prompt: z.string().trim().min(1).max(8000),
    difficulty,
    requirements: requirementsSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });
export type UpdateProblemDto = z.infer<typeof updateProblemSchema>;
