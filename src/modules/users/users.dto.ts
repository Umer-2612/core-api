import { z } from "zod";
import { emailSchema, passwordSchema } from "@modules/auth/auth.dto";

// POST /users. company_name is required only when a super admin is creating
// a hiring manager to found a brand-new company, ignored otherwise.
export const createUserSchema = z.object({
  company_name: z.string().min(1).max(120).optional(),
  full_name: z.string().min(1, { message: "Full name is required" }).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type CreateUserDto = z.infer<typeof createUserSchema>;
