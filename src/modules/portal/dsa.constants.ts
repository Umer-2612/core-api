/** How long a candidate has for the whole dsa round (both questions), counted from
 * when they click "Start", not from when they opened the link. */
export const DSA_ROUND_DURATION_MINUTES = 60;

/** How many questions make up one dsa round. */
export const QUESTIONS_PER_DSA_ROUND = 2;

/** Judge0 language_id for every language the DSA editor offers, matches
 * web-frontend's dsa-constants.ts. */
export const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  javascript: 63,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
  go: 60,
};
