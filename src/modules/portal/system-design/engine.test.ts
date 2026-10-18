import { describe, expect, it } from "vitest";
import { simulate, simulateAll } from "@modules/portal/system-design/engine";
import type { Board, BoardNode, NodeConfig, ProblemRequirements } from "@modules/portal/system-design/types";
import type { ComponentType } from "@modules/portal/system-design/catalog";

const REQ: ProblemRequirements = { target_rps: 1_000_000, read_ratio: 0.9, peak_multiplier: 3, data_size_gb: 1000, latency_slo_ms: 300, availability_slo: 99.9 };

function n(id: string, type: ComponentType, config?: NodeConfig): BoardNode {
  return { id, type, config };
}
function board(nodes: BoardNode[], chains: string[][]): Board {
  const edges = chains.flatMap((chain) => chain.slice(0, -1).map((source, i) => ({ id: `${source}-${chain[i + 1]}`, source, target: chain[i + 1] })));
  return { nodes, edges };
}
const status = (r: ReturnType<typeof simulate>, id: string) => r.nodes.find((x) => x.node_id === id)!.status;
const codes = (r: ReturnType<typeof simulate>) => r.findings.map((f) => f.code);

/** Read-heavy variant: 1M rps at 99% reads leaves 10k writes/s, which one Aurora primary can take. */
const SOLID_REQ: ProblemRequirements = { ...REQ, read_ratio: 0.99 };

/** A design that should survive 1M rps steady and a 3x spike. */
function solidBoard(): Board {
  return board(
    [
      n("u", "users"),
      n("cf", "cloudfront", { cache_hit_ratio: 0.9 }),
      n("waf", "waf"),
      n("lb", "alb", { instances: 10 }),
      n("app", "ec2", { autoscaling: { enabled: true, min: 400, max: 3000 }, multi_az: true }),
      n("cache", "elasticache", { instances: 8, size: "large", multi_az: true, cache_hit_ratio: 0.9 }),
      n("db", "aurora", { size: "xlarge", read_replicas: 8, multi_az: true }),
      n("cw", "cloudwatch"),
    ],
    [["u", "cf", "waf", "lb", "app"], ["app", "cache"], ["app", "db"], ["app", "cw"]],
  );
}

describe("system design engine", () => {
  it("fails a single EC2 behind users at 1M rps", () => {
    const r = simulate(board([n("u", "users"), n("app", "ec2"), n("db", "rds")], [["u", "app", "db"]]), REQ, "steady");
    expect(status(r, "app")).toBe("failed");
    expect(r.bottleneck_node_id).not.toBeNull();
    expect(r.success_rate).toBeLessThan(0.01);
    expect(codes(r)).toContain("overloaded");
    expect(r.slo.availability_ok).toBe(false);
  });

  it("handles steady load with a well scaled design", () => {
    const r = simulate(solidBoard(), SOLID_REQ, "steady");
    expect(r.nodes.filter((x) => x.status === "failed")).toEqual([]);
    expect(r.success_rate).toBeGreaterThan(0.999);
    expect(r.slo.availability_ok).toBe(true);
  });

  it("fails a spike when autoscaling cannot warm up fast enough", () => {
    const b = solidBoard();
    // Small floor: steady state runs ~91 instances, a spike can at most double that before the surge lands.
    b.nodes.find((x) => x.id === "app")!.config = { autoscaling: { enabled: true, min: 50, max: 3000 }, multi_az: true };
    const steady = simulate(b, SOLID_REQ, "steady");
    const spike = simulate(b, { ...SOLID_REQ, peak_multiplier: 6 }, "spike");
    expect(status(steady, "app")).not.toBe("failed");
    expect(status(spike, "app")).toBe("failed");
  });

  it("fails a spike for a fixed fleet without autoscaling", () => {
    const b = solidBoard();
    b.nodes.find((x) => x.id === "app")!.config = { instances: 100, multi_az: true };
    expect(status(simulate(b, SOLID_REQ, "steady"), "app")).not.toBe("failed");
    expect(status(simulate(b, SOLID_REQ, "spike"), "app")).toBe("failed");
  });

  it("takes a single-AZ database down in an AZ failure but survives Multi-AZ", () => {
    const single = solidBoard();
    single.nodes.find((x) => x.id === "db")!.config = { size: "xlarge", read_replicas: 8, multi_az: false };
    const bad = simulate(single, SOLID_REQ, "az_failure");
    expect(status(bad, "db")).toBe("failed");
    expect(codes(bad)).toContain("az_outage");

    const good = simulate(solidBoard(), SOLID_REQ, "az_failure");
    expect(status(good, "db")).not.toBe("failed");
  });

  it("reports missing monitoring, WAF and a single point of failure", () => {
    const r = simulate(board([n("u", "users"), n("app", "ec2"), n("db", "rds")], [["u", "app", "db"]]), { ...REQ, target_rps: 100 }, "steady");
    expect(codes(r)).toEqual(expect.arrayContaining(["no_monitoring", "no_waf", "single_instance", "single_az"]));
    expect(codes(r)).not.toContain("overloaded");
  });

  it("flags databases exposed directly to users", () => {
    const r = simulate(board([n("u", "users"), n("db", "rds")], [["u", "db"]]), { ...REQ, target_rps: 100 }, "steady");
    expect(codes(r)).toContain("exposed_private");
  });

  it("flags unreachable components and a missing entry point", () => {
    const orphan = simulate(board([n("u", "users"), n("app", "ec2"), n("lonely", "s3")], [["u", "app"]]), { ...REQ, target_rps: 100 }, "steady");
    expect(codes(orphan)).toContain("unreachable");
    expect(status(orphan, "lonely")).toBe("idle");

    const none = simulate(board([n("app", "ec2")], []), REQ, "steady");
    expect(codes(none)).toContain("no_entry");
    expect(none.success_rate).toBe(0);
  });

  it("detects traffic loops without hanging", () => {
    const r = simulate(board([n("u", "users"), n("a", "alb"), n("b", "alb")], [["u", "a", "b", "a"]]), REQ, "steady");
    expect(codes(r)).toContain("cycle");
  });

  it("lets a cache absorb reads so the database survives", () => {
    const req = { ...REQ, target_rps: 20_000, read_ratio: 0.95 };
    const make = (hit: number) =>
      board(
        [n("u", "users"), n("app", "ec2", { instances: 100, multi_az: true }), n("cache", "elasticache", { cache_hit_ratio: hit, multi_az: true }), n("db", "rds", { multi_az: true })],
        [["u", "app"], ["app", "cache"], ["app", "db"]],
      );
    expect(status(simulate(make(0), req, "steady"), "db")).toBe("failed");
    expect(status(simulate(make(0.95), req, "steady"), "db")).not.toBe("failed");
  });

  it("treats queue consumers as backlog, not failure", () => {
    const b = board(
      [n("u", "users"), n("api", "lambda", { concurrency_limit: 100_000 }), n("q", "sqs"), n("worker", "ec2", { instances: 2, multi_az: true }), n("db", "dynamodb", { provisioned_capacity: 5_000_000 })],
      [["u", "api", "q", "worker", "db"]],
    );
    const r = simulate(b, { ...REQ, target_rps: 50_000 }, "steady");
    expect(status(r, "worker")).toBe("hot");
    expect(codes(r)).toContain("queue_backlog");
    expect(r.success_rate).toBeGreaterThan(0.99);
  });

  it("marks upstream nodes degraded when a downstream node fails", () => {
    const r = simulate(board([n("u", "users"), n("lb", "alb", { instances: 10 }), n("app", "ec2", { instances: 2 })], [["u", "lb", "app"]]), REQ, "steady");
    expect(status(r, "app")).toBe("failed");
    expect(status(r, "lb")).toBe("degraded");
  });

  it("is deterministic and ignores node order", () => {
    const a = solidBoard();
    const shuffled: Board = { nodes: [...a.nodes].reverse(), edges: [...a.edges].reverse() };
    expect(simulate(shuffled, REQ, "spike")).toEqual(simulate(a, REQ, "spike"));
    expect(simulateAll(a, REQ)).toEqual(simulateAll(a, REQ));
  });

  it("clamps absurd config values instead of producing NaN", () => {
    const b = board([n("u", "users"), n("app", "ec2", { instances: Number.NaN, autoscaling: { enabled: true, min: -5, max: 1e12 } })], [["u", "app"]]);
    const r = simulate(b, { ...REQ, target_rps: 1000 }, "spike");
    for (const node of r.nodes) {
      expect(Number.isFinite(node.load_rps)).toBe(true);
      expect(Number.isFinite(node.utilization)).toBe(true);
    }
  });
});
