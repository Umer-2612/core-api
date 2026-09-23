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
