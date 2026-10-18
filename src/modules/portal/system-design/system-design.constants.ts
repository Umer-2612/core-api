/** How long a candidate has for the whole system design round, counted from "Start". */
export const SYSTEM_DESIGN_ROUND_DURATION_MINUTES = 60;

/** How many simulation runs get an AI hint per round. The engine result itself is never capped,
 * this only bounds LLM spend per candidate. */
export const MAX_AI_HINT_RUNS = 8;
