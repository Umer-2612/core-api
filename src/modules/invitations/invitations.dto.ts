import { z } from "zod";
import { emailSchema } from "@modules/auth/auth.dto";

// POST /invitations
export const createInvitationSchema = z.object({
  email: emailSchema,
  // Required only when a super_admin invites a hiring_manager (creates a new company).
  pending_company_name: z.string().min(1).max(120).optional(),
});
export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;
