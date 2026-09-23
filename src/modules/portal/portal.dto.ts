import { z } from "zod";

// POST /portal/:token/dsa/submit, no auth, the access token is the only gate.
export const submitDsaRoundSchema = z.object({
  code: z.string().min(1, "code is required"),
  language: z.string().min(1, "language is required"),
});
export type SubmitDsaRoundDto = z.infer<typeof submitDsaRoundSchema>;
