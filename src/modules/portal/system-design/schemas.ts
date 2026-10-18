import { z } from "zod";
import { COMPONENT_TYPES } from "@modules/portal/system-design/catalog";
import type { Board } from "@modules/portal/system-design/types";

/** A saved board may carry nulls where the UI cleared a numeric field; treat those as "unset". */
const opt = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v) => (v ?? undefined) as z.output<T> | undefined);

export const nodeConfigSchema = z.object({
  instances: opt(z.number().int().min(1).max(10_000)),
  autoscaling: opt(
    z.object({
      enabled: z.boolean(),
      min: opt(z.number().int().min(1).max(10_000)),
      max: opt(z.number().int().min(1).max(10_000)),
    }),
  ),
  multi_az: opt(z.boolean()),
  read_replicas: opt(z.number().int().min(0).max(15)),
  cache_hit_ratio: opt(z.number().min(0).max(0.99)),
  provisioned_capacity: opt(z.number().min(0).max(1e9)),
  concurrency_limit: opt(z.number().int().min(1).max(1e6)),
  size: opt(z.enum(["small", "medium", "large", "xlarge"])),
});

export const MAX_BOARD_NODES = 80;
export const MAX_BOARD_EDGES = 250;

export const boardSchema = z
  .object({
    nodes: z
      .array(
        z.object({
          // ids are echoed into the LLM prompt, so keep them to a boring charset (no newlines or prose).
          id: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, "Node ids may only use letters, numbers and _ . : -"),
          type: z.enum(COMPONENT_TYPES),
          label: opt(z.string().max(60)),
          position: opt(z.object({ x: z.number().finite(), y: z.number().finite() })),
          config: opt(nodeConfigSchema),
        }),
      )
      .max(MAX_BOARD_NODES),
    edges: z.array(z.object({ id: z.string().min(1).max(140), source: z.string().min(1).max(64), target: z.string().min(1).max(64) })).max(MAX_BOARD_EDGES),
  })
  .superRefine((board, ctx) => {
    if (new Set(board.nodes.map((n) => n.id)).size !== board.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Node ids must be unique", path: ["nodes"] });
    }
  })
  .transform((board): Board => {
    // Drop edges pointing at nodes that no longer exist instead of rejecting the whole save.
    const ids = new Set(board.nodes.map((n) => n.id));
    return {
      nodes: board.nodes.map((n) => ({ ...n, config: n.config ? Object.fromEntries(Object.entries(n.config).filter(([, v]) => v !== undefined)) : undefined })),
      edges: board.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    } as Board;
  });

export const requirementsSchema = z.object({
  target_rps: z.number().positive().max(1e9),
  read_ratio: z.number().min(0).max(1),
  peak_multiplier: z.number().min(1).max(100),
  data_size_gb: z.number().min(0).max(1e9),
  latency_slo_ms: z.number().positive().max(60_000),
  availability_slo: z.number().min(50).max(100),
});

export const scenarioSchema = z.enum(["steady", "spike", "az_failure"]);

// PUT  /portal/:token/system-design/board
export const saveBoardSchema = z.object({ board: boardSchema });
export type SaveBoardDto = z.infer<typeof saveBoardSchema>;

// POST /portal/:token/system-design/simulate
export const simulateSchema = z.object({ board: boardSchema, scenario: scenarioSchema });
export type SimulateDto = z.infer<typeof simulateSchema>;

// POST /portal/:token/system-design/submit
export const submitSystemDesignSchema = z.object({ board: boardSchema });
export type SubmitSystemDesignDto = z.infer<typeof submitSystemDesignSchema>;
