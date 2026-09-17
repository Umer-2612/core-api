import { z } from "zod";
import { emailSchema, passwordSchema } from "@modules/auth/auth.dto";

// POST /users, super_admin only: founds a brand-new company and its first
// hiring manager together, atomically.
export const createUserSchema = z.object({
  company_name: z.string().min(1, { message: "Company name is required" }).max(120),
  full_name: z.string().min(1, { message: "Full name is required" }).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type CreateUserDto = z.infer<typeof createUserSchema>;
