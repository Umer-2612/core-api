import { z } from "zod";

export const emailSchema = z
  .string()
  .min(1, { message: "Email is required" })
  .max(254, { message: "Email is too long (max 254 characters)" })
  .email({ message: "Invalid email format" })
  .transform((email) => email.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters long" })
  .max(128, { message: "Password is too long (max 128 characters)" })
  .refine((p) => /\d/.test(p) && /[a-zA-Z]/.test(p), {
    message: "Password must contain at least one letter and one number",
  });

// POST /auth/login
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Password is required" }),
});
export type LoginDto = z.infer<typeof loginSchema>;

// POST /auth/set-password (accept an invitation by setting a password)
export const setPasswordSchema = z.object({
  token: z.string().min(1, { message: "Token is required" }),
  full_name: z.string().min(1, { message: "Full name is required" }).max(120),
  password: passwordSchema,
});
export type SetPasswordDto = z.infer<typeof setPasswordSchema>;
