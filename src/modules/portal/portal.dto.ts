import { z } from "zod";

// POST /portal/:token/dsa/questions/:questionId/run-tests
// POST /portal/:token/dsa/questions/:questionId/submit
// No auth on either, the access token is the only gate.
export const runDsaTestsSchema = z.object({
  code: z.string().min(1, "code is required"),
  language: z.string().min(1, "language is required"),
});
export type RunDsaTestsDto = z.infer<typeof runDsaTestsSchema>;

export const submitDsaQuestionSchema = runDsaTestsSchema;
export type SubmitDsaQuestionDto = RunDsaTestsDto;

// POST /portal/:token/dsa/focus-loss
// Reported once the candidate's tab regains focus, covering the whole away
// period in one call rather than a separate "left" and "returned" request.
export const reportFocusLossSchema = z.object({
  left_at: z.string().datetime(),
  returned_at: z.string().datetime(),
});
export type ReportFocusLossDto = z.infer<typeof reportFocusLossSchema>;
