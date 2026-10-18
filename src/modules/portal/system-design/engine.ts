import { CATALOG, SIZE_MULTIPLIER, type ComponentDef } from "@modules/portal/system-design/catalog";
import { cleanLabel } from "@modules/portal/system-design/labels";
import {
  SCENARIOS,
  type Board,
  type BoardNode,
  type Finding,
  type NodeConfig,
  type NodeResult,
  type NodeStatus,
  type ProblemRequirements,
  type Scenario,
  type SimulationResult,
} from "@modules/portal/system-design/types";

/** Pure, deterministic capacity model: the same board + requirements always give the same
 * result. Numbers are deliberately round textbook figures, the point is teaching where a
 * design breaks, not benchmarking AWS. */

/** Autoscaling aims for this utilization (target tracking). */
const TARGET_UTIL = 0.6;
const HOT_UTIL = 0.7;
/** During a spike an autoscaling group can at most double what it was running at steady state
 * before the surge lands (instances take minutes to launch and warm up). */
const SPIKE_SCALE_FACTOR = 2;
const MAX_LATENCY_MS = 10_000;

interface Flow {
  reads: number;
  writes: number;
}

const ZERO: Flow = { reads: 0, writes: 0 };
const total = (f: Flow) => f.reads + f.writes;
const scale = (f: Flow, k: number): Flow => ({ reads: f.reads * k, writes: f.writes * k });
const add = (a: Flow, b: Flow): Flow => ({ reads: a.reads + b.reads, writes: a.writes + b.writes });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const round1 = (n: number) => Math.round(n * 10) / 10;

interface ResolvedNode {
  node: BoardNode;
  def: ComponentDef;
  cfg: NodeConfig;
  label: string;
}

/** Defaults from the catalog overlaid with what the candidate set, clamped to sane ranges
 * so a stray value in a saved board can't blow up the math. */
function resolveConfig(def: ComponentDef, raw: NodeConfig | undefined): NodeConfig {
  const cfg: NodeConfig = { ...def.defaults, ...(raw ?? {}) };
  if (def.defaults.autoscaling) cfg.autoscaling = { ...def.defaults.autoscaling, ...(raw?.autoscaling ?? {}) };
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  if ("instances" in def.defaults) cfg.instances = clamp(Math.floor(num(cfg.instances, 1)), 1, 10_000);
  if (cfg.autoscaling) {
    const min = clamp(Math.floor(num(cfg.autoscaling.min, cfg.instances ?? 1)), 1, 10_000);
    const max = clamp(Math.floor(num(cfg.autoscaling.max, min)), min, 10_000);
    cfg.autoscaling = { enabled: cfg.autoscaling.enabled === true, min, max };
  }
  if ("read_replicas" in def.defaults) cfg.read_replicas = clamp(Math.floor(num(cfg.read_replicas, 0)), 0, def.type === "aurora" ? 15 : 5);
  if ("cache_hit_ratio" in def.defaults) cfg.cache_hit_ratio = clamp(num(cfg.cache_hit_ratio, 0.8), 0, 0.99);
  if ("provisioned_capacity" in def.defaults) cfg.provisioned_capacity = clamp(num(cfg.provisioned_capacity, 0), 0, 1e9);
  if ("concurrency_limit" in def.defaults) cfg.concurrency_limit = clamp(Math.floor(num(cfg.concurrency_limit, 1000)), 1, 1e6);
  if (def.sized && !(cfg.size && cfg.size in SIZE_MULTIPLIER)) cfg.size = def.defaults.size ?? "medium";
  cfg.multi_az = cfg.multi_az === true;
  return cfg;
}

interface Graph {
  nodes: Map<string, ResolvedNode>;
  /** Traffic-carrying edges only (no sidecars, nothing leaving a datastore), sorted by target id. */
  out: Map<string, string[]>;
  inn: Map<string, string[]>;
  topo: string[];
  cyclic: Set<string>;
  reachable: Set<string>;
  usersIds: string[];
  unknownTypes: string[];
}

function buildGraph(board: Board): Graph {
  const nodes = new Map<string, ResolvedNode>();
  const unknownTypes: string[] = [];
  for (const node of board.nodes) {
    const def = CATALOG[node.type];
    if (!def) {
      unknownTypes.push(node.id);
      continue;
    }
    if (nodes.has(node.id)) continue;
    nodes.set(node.id, { node, def, cfg: resolveConfig(def, node.config), label: cleanLabel(node.label) || def.label });
  }

  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const id of nodes.keys()) {
    out.set(id, []);
    inn.set(id, []);
  }
  const seen = new Set<string>();
  for (const edge of board.edges) {
    const from = nodes.get(edge.source);
    const to = nodes.get(edge.target);
    if (!from || !to || edge.source === edge.target) continue;
    if (from.def.behavior === "sidecar" || to.def.behavior === "sidecar" || from.def.behavior === "datastore") continue;
    const key = `${edge.source}>${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.get(edge.source)!.push(edge.target);
    inn.get(edge.target)!.push(edge.source);
  }
  for (const list of [...out.values(), ...inn.values()]) list.sort();

  // Kahn's algorithm; whatever is left over sits on a cycle.
  const indeg = new Map<string, number>();
  for (const [id, parents] of inn) indeg.set(id, parents.length);
  const queue = [...nodes.keys()].filter((id) => indeg.get(id) === 0).sort();
  const topo: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topo.push(id);
    for (const child of out.get(id)!) {
      indeg.set(child, indeg.get(child)! - 1);
      if (indeg.get(child) === 0) queue.push(child);
    }
    queue.sort();
  }
  const cyclic = new Set([...nodes.keys()].filter((id) => !topo.includes(id)));

  const usersIds = [...nodes.values()].filter((n) => n.def.behavior === "source").map((n) => n.node.id).sort();
  const reachable = new Set<string>(usersIds);
  const stack = [...usersIds];
  while (stack.length > 0) {
    for (const child of out.get(stack.pop()!)!) {
      if (!reachable.has(child)) {
        reachable.add(child);
        stack.push(child);
      }
    }
  }
  return { nodes, out, inn, topo: topo.filter((id) => !cyclic.has(id)), cyclic, reachable, usersIds, unknownTypes };
}

/** What a node sends onward, given what it received. */
function outFlow(n: ResolvedNode, inbound: Flow): Flow {
  if (n.def.behavior === "cache") return { reads: inbound.reads * (1 - (n.cfg.cache_hit_ratio ?? 0)), writes: inbound.writes };
  return inbound;
}

function isLeafCache(g: Graph, id: string): boolean {
  return g.out.get(id)!.every((c) => g.nodes.get(c)!.def.behavior !== "datastore");
}

/** Propagate a request rate from users through the graph; returns the inbound flow per node. */
function propagate(g: Graph, req: ProblemRequirements, multiplier: number): Map<string, Flow> {
  const inbound = new Map<string, Flow>();
  for (const id of g.nodes.keys()) inbound.set(id, ZERO);
  const injected = (req.target_rps * multiplier) / Math.max(1, g.usersIds.length);
  for (const id of g.usersIds) inbound.set(id, { reads: injected * req.read_ratio, writes: injected * (1 - req.read_ratio) });

  for (const id of g.topo) {
    if (!g.reachable.has(id)) continue;
    const n = g.nodes.get(id)!;
    const children = g.out.get(id)!;
    if (children.length === 0) continue;
    const out = outFlow(n, inbound.get(id)!);

    if (n.def.fanout === "split") {
      const share = scale(out, 1 / children.length);
      for (const c of children) inbound.set(c, add(inbound.get(c)!, share));
      continue;
    }
    // replicate: every dependency is called for every request. Cache-aside: a sibling cache that
    // sits beside a database (not in front of it) absorbs that share of reads before the database.
    const sideCache = children
      .map((c) => g.nodes.get(c)!)
      .find((c) => c.def.behavior === "cache" && isLeafCache(g, c.node.id));
    for (const c of children) {
      const child = g.nodes.get(c)!;
      const flow =
        sideCache && child.def.behavior === "datastore"
          ? { reads: out.reads * (1 - (sideCache.cfg.cache_hit_ratio ?? 0)), writes: out.writes }
          : out;
      inbound.set(c, add(inbound.get(c)!, flow));
    }
  }
  return inbound;
}

/** Load that counts against a node's capacity. Replicas take their share of reads off a database. */
function effectiveLoad(n: ResolvedNode, inbound: Flow): number {
  if (n.def.capacity_model === "db") return inbound.writes + inbound.reads / (1 + (n.cfg.read_replicas ?? 0));
  return total(inbound);
}

function unitCapacity(n: ResolvedNode): number {
  return n.def.per_unit * (n.def.sized ? SIZE_MULTIPLIER[n.cfg.size ?? "medium"] : 1);
}

interface Capacity {
  capacity: number | null;
  instances: number | null;
  azDown: boolean;
}

function capacityOf(n: ResolvedNode, load: number, steadyLoad: number, scenario: Scenario): Capacity {
  const { def, cfg } = n;
  let capacity: number | null;
  let instances: number | null = null;

  switch (def.capacity_model) {
    case "instances": {
      const unit = unitCapacity(n);
      const needed = (l: number) => Math.ceil(l / (unit * TARGET_UTIL));
      if (def.autoscalable && cfg.autoscaling?.enabled) {
        const { min = 1, max = 1 } = cfg.autoscaling;
        const steadyInstances = clamp(needed(steadyLoad), min, max);
        instances =
          scenario === "spike"
            ? clamp(Math.min(needed(load), steadyInstances * SPIKE_SCALE_FACTOR), min, max)
            : clamp(needed(load), min, max);
      } else {
        instances = cfg.instances ?? 1;
      }
      capacity = unit * instances;
      break;
    }
    case "db":
      capacity = unitCapacity(n);
      break;
    case "concurrency":
      capacity = (cfg.concurrency_limit ?? 1000) * 10;
      break;
    case "provisioned":
      capacity = cfg.provisioned_capacity ?? 0;
      break;
    case "fixed":
      capacity = def.per_unit;
      break;
    default:
      capacity = null;
  }

  let azDown = false;
  if (scenario === "az_failure" && def.zonal && capacity !== null) {
    if (cfg.multi_az) capacity *= def.az_loss_factor;
    else {
      capacity = 0;
      azDown = true;
    }
  }
  return { capacity, instances, azDown };
}

function nodeLatency(def: ComponentDef, utilization: number): number {
  const u = Math.max(0, utilization);
  const base = def.base_latency_ms * (1 + 4 * u * u);
  return Math.min(MAX_LATENCY_MS, u < 1 ? base : base + 1000 * (u - 1));
}

function isBuffered(g: Graph, id: string): boolean {
  const parents = g.inn.get(id)!;
  return parents.length > 0 && parents.every((p) => g.nodes.get(p)!.def.buffers);
}

/** Run one scenario against a board. */
export function simulate(board: Board, req: ProblemRequirements, scenario: Scenario): SimulationResult {
  const g = buildGraph(board);
  const findings: Finding[] = [];
  const multiplier = scenario === "spike" ? req.peak_multiplier : 1;
  const offered = req.target_rps * multiplier;

  for (const id of g.unknownTypes) {
    findings.push({ code: "unknown_component", severity: "warning", category: "design", node_id: id, title: "Unknown component", detail: `Node ${id} is not a supported component and was ignored.` });
  }

  const emptyNodes = (reason: string): NodeResult[] =>
    [...g.nodes.keys()].sort().map((node_id) => ({ node_id, load_rps: 0, capacity_rps: null, utilization: 0, status: "idle", reason }));

  if (g.usersIds.length === 0) {
    findings.push({ code: "no_entry", severity: "critical", category: "design", title: "No entry point", detail: "Add a Users component and connect it to your system. Nothing sends traffic yet." });
    return finish({ scenario, offered_rps: offered, nodes: emptyNodes("No traffic source on the board."), success_rate: 0, est_p99_ms: 0, bottleneck_node_id: null, findings }, req);
  }

  const steady = propagate(g, req, 1);
  const inbound = scenario === "spike" ? propagate(g, req, multiplier) : steady;

  const results = new Map<string, NodeResult>();
  const serve = new Map<string, number>();
  const util = new Map<string, number>();
  const buffered = new Set<string>();

  for (const id of [...g.nodes.keys()].sort()) {
    const n = g.nodes.get(id)!;
    const flow = inbound.get(id)!;
    const reachable = g.reachable.has(id) && !g.cyclic.has(id);

    if (n.def.behavior === "sidecar") {
      results.set(id, { node_id: id, load_rps: 0, capacity_rps: null, utilization: 0, status: "ok", reason: "Present on the board. No request flow is modeled for this component." });
      serve.set(id, 1);
      continue;
    }
    if (n.def.behavior === "source") {
      results.set(id, { node_id: id, load_rps: round1(total(flow)), capacity_rps: null, utilization: 0, status: "ok", reason: `Generating ~${fmt(total(flow))} requests/s.` });
      serve.set(id, 1);
      continue;
    }
    if (!reachable) {
      results.set(id, { node_id: id, load_rps: 0, capacity_rps: null, utilization: 0, status: "idle", reason: g.cyclic.has(id) ? "Part of a traffic loop." : "Not connected to the request path from Users." });
      serve.set(id, 1);
      continue;
    }

    const load = effectiveLoad(n, flow);
    const steadyLoad = effectiveLoad(n, steady.get(id)!);
    const { capacity, instances, azDown } = capacityOf(n, load, steadyLoad, scenario);
    const utilization = capacity === null ? 0 : capacity <= 0 ? (load > 0 ? Infinity : 0) : load / capacity;
    const isBuf = isBuffered(g, id);
    if (isBuf) buffered.add(id);

    let status: NodeStatus = utilization >= 1 ? "failed" : utilization >= HOT_UTIL ? "hot" : "ok";
    let reason = `Handling ~${fmt(load)} rps of ~${fmt(capacity ?? 0)} rps capacity${instances !== null ? ` (${instances} instance${instances === 1 ? "" : "s"})` : ""}.`;

    if (azDown && load > 0) {
      status = "failed";
      reason = `Not Multi-AZ: an Availability Zone outage takes it down while ~${fmt(load)} rps arrive.`;
      findings.push({ code: "az_outage", severity: "critical", category: "reliability", node_id: id, title: `${n.label} is lost in an AZ outage`, detail: `It runs in a single Availability Zone, so an AZ failure removes all of its capacity. Enable Multi-AZ or spread it across zones.` });
    } else if (status === "failed" && isBuf) {
      status = "hot";
      reason = `Consumer is slower than the queue: ~${fmt(load)} rps arrive but only ~${fmt(capacity ?? 0)} rps can be processed. The backlog grows.`;
      findings.push({ code: "queue_backlog", severity: "warning", category: "capacity", node_id: id, title: `${n.label} cannot keep up with the queue`, detail: `The backlog grows by about ${fmt(load - (capacity ?? 0))} messages/s. Requests are not lost but latency to completion keeps rising. Add consumers or scale this component.` });
    } else if (status === "failed") {
      reason = `Overloaded: ~${fmt(load)} rps arrive but it can only handle ~${fmt(capacity ?? 0)} rps${instances !== null ? ` with ${instances} instance${instances === 1 ? "" : "s"}` : ""}.`;
      findings.push({ code: "overloaded", severity: "critical", category: "capacity", node_id: id, title: `${n.label} is overloaded`, detail: `Receives ~${fmt(load)} rps against ~${fmt(capacity ?? 0)} rps of capacity (${Math.round(utilization * 100)}% utilization). ${scenario === "spike" && n.def.autoscalable ? "Autoscaling cannot add instances fast enough for a sudden spike, so pre-scale or put a queue/cache in front." : "Scale it out, add caching in front, or reduce the load that reaches it."}` });
    } else if (status === "hot") {
      findings.push({ code: "near_capacity", severity: "warning", category: "capacity", node_id: id, title: `${n.label} is running hot`, detail: `${Math.round(utilization * 100)}% utilization leaves little headroom for bursts.` });
    }

    util.set(id, utilization);
    serve.set(id, isBuf || capacity === null ? 1 : load <= 0 ? 1 : clamp((capacity ?? 0) / load, 0, 1));
    results.set(id, { node_id: id, load_rps: round1(load), capacity_rps: capacity === null ? null : round1(capacity), utilization: Number.isFinite(utilization) ? round1(utilization * 1000) / 1000 : 99, status, reason });
  }

  // A failing node drags every node upstream of it down with it.
  const failed = [...results.values()].filter((r) => r.status === "failed").map((r) => r.node_id);
  const seen = new Set<string>();
  const walk = [...failed];
  while (walk.length > 0) {
    const id = walk.pop()!;
    for (const parent of g.inn.get(id) ?? []) {
      if (seen.has(parent)) continue;
      seen.add(parent);
      walk.push(parent);
      const r = results.get(parent)!;
      if (g.nodes.get(parent)!.def.behavior !== "source" && (r.status === "ok" || r.status === "hot")) {
        r.status = "degraded";
        r.reason = `Requests passing through it fail downstream (${g.nodes.get(id)!.label} is failing).`;
      }
    }
  }

  // Share of requests that complete, walking the graph from the leaves up.
  const success = new Map<string, number>();
  for (const id of [...g.topo].reverse()) {
    if (!g.reachable.has(id)) continue;
    const n = g.nodes.get(id)!;
    const kids = g.out.get(id)!.filter((c) => g.reachable.has(c));
    const s = serve.get(id) ?? 1;
    const childS = kids.map((c) => success.get(c) ?? 1);
    const mean = childS.length === 0 ? 1 : childS.reduce((a, b) => a + b, 0) / childS.length;
    const flow = inbound.get(id)!;
    let value: number;
    switch (n.def.behavior) {
      case "datastore":
      case "queue":
        value = s;
        break;
      case "cache": {
        const t = total(flow);
        const h = n.cfg.cache_hit_ratio ?? 0;
        // A leaf cache (cache-aside) doesn't sit on the path; its parent's database sees the misses.
        value = t <= 0 || childS.length === 0 ? s : s * ((flow.reads * h + flow.reads * (1 - h) * mean + flow.writes * mean) / t);
        break;
      }
      case "compute":
        value = s * childS.reduce((a, b) => a * b, 1);
        break;
      default:
        value = s * mean;
    }
    success.set(id, value);
  }
  const success_rate = clamp(g.usersIds.reduce((a, id) => a + (success.get(id) ?? 0), 0) / g.usersIds.length, 0, 1);

  // p99 ~ the slowest synchronous path; queues end the synchronous part of a request.
  const latency = new Map<string, number>();
  for (const id of [...g.topo].reverse()) {
    if (!g.reachable.has(id)) continue;
    const n = g.nodes.get(id)!;
    const own = n.def.behavior === "source" || n.def.behavior === "sidecar" ? 0 : nodeLatency(n.def, util.get(id) ?? 0);
    const tail = n.def.behavior === "queue" ? 0 : Math.max(0, ...g.out.get(id)!.filter((c) => g.reachable.has(c)).map((c) => latency.get(c) ?? 0));
    latency.set(id, Math.min(MAX_LATENCY_MS, own + tail));
  }
  const est_p99_ms = Math.round(Math.max(0, ...g.usersIds.map((id) => latency.get(id) ?? 0)));

  let bottleneck_node_id: string | null = null;
  let worst = 0;
  for (const id of [...util.keys()].sort()) {
    const u = util.get(id)!;
    if (u > worst) {
      worst = u;
      bottleneck_node_id = id;
    }
  }

  findings.push(...designFindings(g, req));
  return finish({ scenario, offered_rps: offered, nodes: [...results.values()], success_rate: Math.round(success_rate * 10_000) / 10_000, est_p99_ms, bottleneck_node_id, findings }, req);
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

function finish(partial: Omit<SimulationResult, "slo">, req: ProblemRequirements): SimulationResult {
  const findings = [...partial.findings];
  const slo = { latency_ok: partial.est_p99_ms <= req.latency_slo_ms, availability_ok: partial.success_rate * 100 >= req.availability_slo };
  if (partial.nodes.some((n) => n.status !== "idle") || partial.success_rate > 0) {
    if (!slo.availability_ok) {
      findings.push({ code: "slo_availability", severity: "critical", category: "reliability", title: "Availability target missed", detail: `About ${(partial.success_rate * 100).toFixed(2)}% of requests succeed, the target is ${req.availability_slo}%.` });
    }
    if (!slo.latency_ok && slo.availability_ok) {
      findings.push({ code: "slo_latency", severity: "warning", category: "capacity", title: "Latency target missed", detail: `Estimated p99 is ~${fmt(partial.est_p99_ms)} ms, the target is ${fmt(req.latency_slo_ms)} ms.` });
    }
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code) || (a.node_id ?? "").localeCompare(b.node_id ?? ""));
  return { ...partial, findings, slo };
}

/** Checks that depend only on how the board is drawn, not on load. */
function designFindings(g: Graph, req: ProblemRequirements): Finding[] {
  const out: Finding[] = [];
  const all = [...g.nodes.values()].sort((a, b) => a.node.id.localeCompare(b.node.id));
  const has = (type: string) => all.some((n) => n.def.type === type);
  const reachable = all.filter((n) => g.reachable.has(n.node.id) && !g.cyclic.has(n.node.id));

  if (g.cyclic.size > 0) {
    const names = [...g.cyclic].sort().map((id) => g.nodes.get(id)!.label).join(", ");
    out.push({ code: "cycle", severity: "critical", category: "design", title: "Traffic loop", detail: `These components send requests around in a circle: ${names}. Requests flow one way, from users toward the data.` });
  }

  for (const n of all) {
    if (n.def.behavior === "sidecar" || n.def.behavior === "source") continue;
    if (!g.reachable.has(n.node.id) && !g.cyclic.has(n.node.id)) {
      out.push({ code: "unreachable", severity: "warning", category: "design", node_id: n.node.id, title: `${n.label} is not connected`, detail: "No path of arrows leads to it from Users, so it never receives traffic." });
    }
  }

  if (!reachable.some((n) => n.def.behavior === "datastore")) {
    out.push({ code: "no_datastore", severity: "warning", category: "design", title: "No data store on the request path", detail: "Nothing the users can reach persists data. Where do links, messages or posts live?" });
  }

  for (const id of g.usersIds) {
    for (const c of g.out.get(id)!) {
      const target = g.nodes.get(c)!;
      if (target.def.private) {
        out.push({ code: "exposed_private", severity: "critical", category: "security", node_id: c, title: `${target.label} is exposed to the internet`, detail: "Clients should never talk to a database or cache directly. Put an application tier in front of it." });
      }
    }
  }

  for (const n of reachable) {
    const { def, cfg, node } = n;
    const id = node.id;
    if (def.type === "ec2" || def.type === "ecs") {
      const maxInstances = cfg.autoscaling?.enabled ? cfg.autoscaling.max ?? 1 : cfg.instances ?? 1;
      const minInstances = cfg.autoscaling?.enabled ? cfg.autoscaling.min ?? 1 : cfg.instances ?? 1;
      const parents = g.inn.get(id)!.map((p) => g.nodes.get(p)!.def.type);
      if (minInstances < 2 && !cfg.multi_az) {
        out.push({ code: "single_instance", severity: "warning", category: "reliability", node_id: id, title: `${n.label} is a single point of failure`, detail: "One instance in one AZ: if it dies, the service is down. Run at least two across zones (a minimum of 2 in the Auto Scaling group)." });
      } else if (!cfg.multi_az) {
        out.push({ code: "single_az", severity: "warning", category: "reliability", node_id: id, title: `${n.label} runs in a single AZ`, detail: "All instances share one Availability Zone, so one zone outage takes the tier down. Enable Multi-AZ." });
      }
      if (maxInstances > 1 && !parents.some((t) => t === "alb" || t === "api_gateway")) {
        out.push({ code: "no_load_balancer", severity: "warning", category: "design", node_id: id, title: `${n.label} has multiple instances but no load balancer`, detail: "Nothing distributes requests across the instances. Put an ALB (or API Gateway) in front." });
      }
    } else if (def.zonal && !cfg.multi_az) {
      out.push({ code: "single_az", severity: "warning", category: "reliability", node_id: id, title: `${n.label} runs in a single AZ`, detail: "No standby in another Availability Zone. A zone outage means downtime until you restore it." });
    }

    if (def.capacity_model === "db" && req.read_ratio >= 0.7 && (cfg.read_replicas ?? 0) === 0) {
      const ancestors = new Set<string>();
      const stack = [id];
      while (stack.length > 0) {
        for (const p of g.inn.get(stack.pop()!)!) {
          if (!ancestors.has(p)) {
            ancestors.add(p);
            stack.push(p);
          }
        }
        // Cache-aside siblings count too: a cache beside the database under a shared parent.
      }
      const cached = [...ancestors].some((a) => g.nodes.get(a)!.def.behavior === "cache") || [...ancestors].some((a) => g.out.get(a)!.some((c) => g.nodes.get(c)!.def.behavior === "cache" && isLeafCache(g, c)));
      if (!cached) {
        out.push({ code: "read_heavy_no_scaling", severity: "warning", category: "capacity", node_id: id, title: `${n.label} serves a read-heavy workload with no read scaling`, detail: `About ${Math.round(req.read_ratio * 100)}% of traffic is reads, but there are no read replicas and no cache in front. Add replicas and/or a cache.` });
      }
    }

    if (def.type === "elasticache") {
      const parents = g.inn.get(id)!;
      const inLine = !isLeafCache(g, id);
      const cacheAside = parents.some((p) => g.out.get(p)!.some((c) => g.nodes.get(c)!.def.behavior === "datastore"));
      if (!inLine && !cacheAside) {
        out.push({ code: "cache_not_in_path", severity: "warning", category: "design", node_id: id, title: `${n.label} is not in front of any data store`, detail: "A cache only helps if reads check it before the database. Connect the app tier to both, or place the cache between the app and the database." });
      }
    }
  }

  if (!has("cloudwatch")) {
    out.push({ code: "no_monitoring", severity: "warning", category: "observability", title: "No monitoring", detail: "You would not know the system is failing until users complain. Add CloudWatch for metrics, logs and alarms." });
  }
  if (g.usersIds.some((id) => g.out.get(id)!.length > 0) && !has("waf") && !has("shield")) {
    out.push({ code: "no_waf", severity: "warning", category: "security", title: "Public entry point without WAF or Shield", detail: "Anyone can hit the system with bad or abusive traffic. Add AWS WAF (rate limiting, rules) and Shield for DDoS protection." });
  }
  if (!has("cognito") && !has("api_gateway")) {
    out.push({ code: "no_auth", severity: "info", category: "security", title: "No authentication component", detail: "Consider how callers prove who they are, for example Cognito or an authorizer on API Gateway." });
  }
  return out;
}

export function simulateAll(board: Board, req: ProblemRequirements): Record<Scenario, SimulationResult> {
  return Object.fromEntries(SCENARIOS.map((s) => [s, simulate(board, req, s)])) as Record<Scenario, SimulationResult>;
}
