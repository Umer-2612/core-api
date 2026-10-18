import type { ComponentType } from "@modules/portal/system-design/catalog";

export type SizeClass = "small" | "medium" | "large" | "xlarge";

/** Per-node settings the candidate edits in the config panel. Every key is optional;
 * the catalog supplies a default for anything the component supports and the engine
 * ignores keys a component doesn't use. */
export interface NodeConfig {
  instances?: number;
  autoscaling?: { enabled: boolean; min?: number; max?: number };
  multi_az?: boolean;
  read_replicas?: number;
  cache_hit_ratio?: number;
  /** Requests per second for services sold by throughput (API Gateway, DynamoDB, SNS). */
  provisioned_capacity?: number;
  /** Lambda reserved/account concurrency. */
  concurrency_limit?: number;
  /** Instance class for databases, caches and search domains. */
  size?: SizeClass;
}

export interface BoardNode {
  id: string;
  type: ComponentType;
  label?: string;
  position?: { x: number; y: number };
  config?: NodeConfig;
}

export interface BoardEdge {
  id: string;
  source: string;
  target: string;
}

export interface Board {
  nodes: BoardNode[];
  edges: BoardEdge[];
}

export interface ProblemRequirements {
  target_rps: number;
  /** Share of traffic that is reads, 0..1. */
  read_ratio: number;
  /** Multiplier applied to target_rps in the `spike` scenario. */
  peak_multiplier: number;
  data_size_gb: number;
  latency_slo_ms: number;
  availability_slo: number;
}

export type Scenario = "steady" | "spike" | "az_failure";
export const SCENARIOS: Scenario[] = ["steady", "spike", "az_failure"];

export type NodeStatus = "ok" | "hot" | "failed" | "degraded" | "idle";

export interface NodeResult {
  node_id: string;
  load_rps: number;
  /** null for components with no modeled capacity (users, monitoring, auth). */
  capacity_rps: number | null;
  utilization: number;
  status: NodeStatus;
  reason: string;
}

export type FindingSeverity = "critical" | "warning" | "info";
export type FindingCategory = "capacity" | "reliability" | "security" | "observability" | "design";

export interface Finding {
  code: string;
  severity: FindingSeverity;
  category: FindingCategory;
  node_id?: string;
  title: string;
  detail: string;
}

export interface SimulationResult {
  scenario: Scenario;
  offered_rps: number;
  nodes: NodeResult[];
  /** Share of user requests that complete, 0..1. */
  success_rate: number;
  est_p99_ms: number;
  bottleneck_node_id: string | null;
  slo: { latency_ok: boolean; availability_ok: boolean };
  findings: Finding[];
}
