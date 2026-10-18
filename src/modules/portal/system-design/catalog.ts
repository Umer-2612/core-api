import type { NodeConfig, SizeClass } from "@modules/portal/system-design/types";

export const COMPONENT_TYPES = [
  "users",
  "route53",
  "cloudfront",
  "waf",
  "shield",
  "api_gateway",
  "alb",
  "ec2",
  "ecs",
  "lambda",
  "rds",
  "aurora",
  "dynamodb",
  "elasticache",
  "s3",
  "opensearch",
  "sqs",
  "sns",
  "kinesis",
  "cloudwatch",
  "cognito",
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export type Category = "client" | "network" | "compute" | "database" | "cache" | "storage" | "messaging" | "observability" | "security";

export const SIZE_MULTIPLIER: Record<SizeClass, number> = { small: 1, medium: 2, large: 4, xlarge: 8 };

/** How a component treats the traffic that reaches it:
 *  - source: the users, injects the load
 *  - passthrough: forwards what it receives (DNS, WAF, gateway, load balancer)
 *  - cache: absorbs a share of reads, forwards the rest plus all writes
 *  - compute: runs the application, calls every downstream dependency
 *  - datastore: terminal, requests end here
 *  - queue: accepts and buffers; consumers drain it asynchronously
 *  - sidecar: monitoring/auth/DDoS, no request flow modeled, only presence matters */
export type Behavior = "source" | "passthrough" | "cache" | "compute" | "datastore" | "queue" | "sidecar";

/** How capacity is derived:
 *  - instances: per_unit * instance count (* size class when `sized`)
 *  - db: per_unit * size class, replicas offload reads
 *  - concurrency: concurrency_limit * 10 rps (assumes ~100ms per invocation)
 *  - provisioned: provisioned_capacity rps
 *  - fixed: per_unit
 *  - none: no modeled capacity */
export type CapacityModel = "instances" | "db" | "concurrency" | "provisioned" | "fixed" | "none";

export interface ComponentDef {
  type: ComponentType;
  label: string;
  category: Category;
  behavior: Behavior;
  /** How outgoing traffic is shared among several downstream nodes. */
  fanout: "split" | "replicate";
  capacity_model: CapacityModel;
  per_unit: number;
  sized: boolean;
  base_latency_ms: number;
  /** Lives in one AZ unless `multi_az` is set; an AZ outage takes it down. */
  zonal: boolean;
  /** Capacity left during an AZ outage when `multi_az` is on. */
  az_loss_factor: number;
  autoscalable: boolean;
  /** Should never be reachable straight from users (databases, caches). */
  private: boolean;
  /** Consumers behind it see overload as backlog, not failure. */
  buffers: boolean;
  defaults: NodeConfig;
  /** Which config keys the panel offers for this component. */
  config_keys: (keyof NodeConfig)[];
}

function def(partial: Partial<ComponentDef> & Pick<ComponentDef, "type" | "label" | "category" | "behavior">): ComponentDef {
  return {
    fanout: "split",
    capacity_model: "none",
    per_unit: 0,
    sized: false,
    base_latency_ms: 1,
    zonal: false,
    az_loss_factor: 1,
    autoscalable: false,
    private: false,
    buffers: false,
    defaults: {},
    config_keys: [],
    ...partial,
  };
}

const DEFS: ComponentDef[] = [
  def({ type: "users", label: "Users", category: "client", behavior: "source" }),
  def({ type: "route53", label: "Route 53", category: "network", behavior: "passthrough", capacity_model: "fixed", per_unit: 10_000_000, base_latency_ms: 1 }),
  def({
    type: "cloudfront",
    label: "CloudFront",
    category: "network",
    behavior: "cache",
    capacity_model: "fixed",
    per_unit: 5_000_000,
    base_latency_ms: 10,
    defaults: { cache_hit_ratio: 0.8 },
    config_keys: ["cache_hit_ratio"],
  }),
  // WAF isn't throughput-limited the way a proxy is: it runs inside the CloudFront/ALB/API Gateway it is
  // attached to and scales with them, so it's modeled as effectively unbounded.
  def({ type: "waf", label: "AWS WAF", category: "security", behavior: "passthrough", capacity_model: "fixed", per_unit: 50_000_000, base_latency_ms: 2 }),
  def({ type: "shield", label: "AWS Shield", category: "security", behavior: "sidecar" }),
  def({
    type: "api_gateway",
    label: "API Gateway",
    category: "network",
    behavior: "passthrough",
    capacity_model: "provisioned",
    base_latency_ms: 15,
    defaults: { provisioned_capacity: 10_000 },
    config_keys: ["provisioned_capacity"],
  }),
  def({
    type: "alb",
    label: "Load Balancer (ALB)",
    category: "network",
    behavior: "passthrough",
    capacity_model: "instances",
    per_unit: 300_000,
    base_latency_ms: 3,
    defaults: { instances: 1 },
    config_keys: ["instances"],
  }),
  def({
    type: "ec2",
    label: "EC2 / Auto Scaling",
    category: "compute",
    behavior: "compute",
    fanout: "replicate",
    capacity_model: "instances",
    per_unit: 2_000,
    base_latency_ms: 25,
    zonal: true,
    az_loss_factor: 0.5,
    autoscalable: true,
    defaults: { instances: 1, multi_az: false, autoscaling: { enabled: false, min: 1, max: 10 } },
    config_keys: ["instances", "autoscaling", "multi_az"],
  }),
  def({
    type: "ecs",
    label: "ECS / Fargate",
    category: "compute",
    behavior: "compute",
    fanout: "replicate",
    capacity_model: "instances",
    per_unit: 1_500,
    base_latency_ms: 30,
    zonal: true,
    az_loss_factor: 0.5,
    autoscalable: true,
    defaults: { instances: 1, multi_az: false, autoscaling: { enabled: false, min: 1, max: 10 } },
    config_keys: ["instances", "autoscaling", "multi_az"],
  }),
  def({
    type: "lambda",
    label: "Lambda",
    category: "compute",
    behavior: "compute",
    fanout: "replicate",
    capacity_model: "concurrency",
    base_latency_ms: 60,
    defaults: { concurrency_limit: 1_000 },
    config_keys: ["concurrency_limit"],
  }),
  def({
    type: "rds",
    label: "RDS",
    category: "database",
    behavior: "datastore",
    capacity_model: "db",
    per_unit: 4_000,
    sized: true,
    base_latency_ms: 8,
    zonal: true,
    private: true,
    defaults: { size: "medium", multi_az: false, read_replicas: 0 },
    config_keys: ["size", "multi_az", "read_replicas"],
  }),
  def({
    type: "aurora",
    label: "Aurora",
    category: "database",
    behavior: "datastore",
    capacity_model: "db",
    per_unit: 12_000,
    sized: true,
    base_latency_ms: 6,
    zonal: true,
    private: true,
    defaults: { size: "medium", multi_az: false, read_replicas: 0 },
    config_keys: ["size", "multi_az", "read_replicas"],
  }),
  def({
    type: "dynamodb",
    label: "DynamoDB",
    category: "database",
    behavior: "datastore",
    capacity_model: "provisioned",
    base_latency_ms: 5,
    defaults: { provisioned_capacity: 25_000 },
    config_keys: ["provisioned_capacity"],
  }),
  def({
    type: "elasticache",
    label: "ElastiCache",
    category: "cache",
    behavior: "cache",
    capacity_model: "instances",
    per_unit: 80_000,
    sized: true,
    base_latency_ms: 1,
    zonal: true,
    az_loss_factor: 0.5,
    private: true,
    defaults: { instances: 1, size: "medium", multi_az: false, cache_hit_ratio: 0.8 },
    config_keys: ["instances", "size", "multi_az", "cache_hit_ratio"],
  }),
  def({ type: "s3", label: "S3", category: "storage", behavior: "datastore", capacity_model: "fixed", per_unit: 55_000, base_latency_ms: 25 }),
  def({
    type: "opensearch",
    label: "OpenSearch",
    category: "database",
    behavior: "datastore",
    capacity_model: "instances",
    per_unit: 5_000,
    sized: true,
    base_latency_ms: 15,
    zonal: true,
    az_loss_factor: 0.5,
    private: true,
    defaults: { instances: 1, size: "medium", multi_az: false },
    config_keys: ["instances", "size", "multi_az"],
  }),
  def({ type: "sqs", label: "SQS", category: "messaging", behavior: "queue", capacity_model: "fixed", per_unit: 1_000_000, base_latency_ms: 10, buffers: true }),
  def({
    type: "sns",
    label: "SNS",
    category: "messaging",
    behavior: "queue",
    fanout: "replicate",
    capacity_model: "provisioned",
    base_latency_ms: 10,
    defaults: { provisioned_capacity: 30_000 },
    config_keys: ["provisioned_capacity"],
  }),
  def({
    type: "kinesis",
    label: "Kinesis",
    category: "messaging",
    behavior: "queue",
    fanout: "replicate",
    capacity_model: "instances",
    per_unit: 1_000,
    base_latency_ms: 20,
    buffers: true,
    defaults: { instances: 1 },
    config_keys: ["instances"],
  }),
  def({ type: "cloudwatch", label: "CloudWatch", category: "observability", behavior: "sidecar" }),
  def({ type: "cognito", label: "Cognito", category: "security", behavior: "sidecar" }),
];

export const CATALOG: Record<ComponentType, ComponentDef> = Object.fromEntries(DEFS.map((d) => [d.type, d])) as Record<ComponentType, ComponentDef>;

export function isComponentType(value: string): value is ComponentType {
  return (COMPONENT_TYPES as readonly string[]).includes(value);
}
