import "reflect-metadata";
import "@shared/config/env";
import { logger } from "@shared/utils/logger";
import { connectDatabase, disconnectDatabase, prisma } from "@/db/prisma";

type Difficulty = "easy" | "medium" | "hard";

interface SeedProblem {
  title: string;
  prompt: string;
  difficulty: Difficulty;
  requirements: {
    target_rps: number;
    /** Share of traffic that is reads, 0..1. */
    read_ratio: number;
    /** Multiplier applied to target_rps in the `spike` scenario. */
    peak_multiplier: number;
    data_size_gb: number;
    latency_slo_ms: number;
    availability_slo: number;
  };
}

/** Global presets (company_id null, read-only for hiring managers). */
const PROBLEMS: SeedProblem[] = [
  {
    title: "URL Shortener",
    prompt:
      "Design a URL shortening service (like bit.ly). Users create short links and anyone can follow them.\n\n" +
      "Cover: how links are stored and looked up, how you scale reads (redirects dominate), how you survive traffic spikes, " +
      "how you protect against abuse, and how you would monitor it.",
    difficulty: "easy",
    requirements: { target_rps: 100_000, read_ratio: 0.95, peak_multiplier: 5, data_size_gb: 500, latency_slo_ms: 100, availability_slo: 99.95 },
  },
  {
    title: "Chat / Messaging App",
    prompt:
      "Design a real-time messaging service supporting 1:1 and group chats with message history.\n\n" +
      "Cover: delivery guarantees, how messages fan out to group members, how you store history, " +
      "how you handle a sudden surge of connected users, and authentication.",
    difficulty: "medium",
    requirements: { target_rps: 250_000, read_ratio: 0.6, peak_multiplier: 4, data_size_gb: 5_000, latency_slo_ms: 200, availability_slo: 99.95 },
  },
  {
    title: "News Feed",
    prompt:
      "Design a social news feed where users see posts from people they follow.\n\n" +
      "Cover: feed generation (fan-out on write vs read), caching, handling celebrity accounts with millions of followers, " +
      "media storage and delivery, and observability.",
    difficulty: "medium",
    requirements: { target_rps: 500_000, read_ratio: 0.9, peak_multiplier: 3, data_size_gb: 20_000, latency_slo_ms: 300, availability_slo: 99.9 },
  },
  {
    title: "Video Streaming Platform",
    prompt:
      "Design a video-on-demand platform. Creators upload videos; viewers stream them worldwide.\n\n" +
      "Cover: upload and transcoding pipeline, global delivery, storage costs, handling a viral video, " +
      "and protecting content and the service.",
    difficulty: "hard",
    requirements: { target_rps: 1_000_000, read_ratio: 0.98, peak_multiplier: 10, data_size_gb: 500_000, latency_slo_ms: 500, availability_slo: 99.9 },
  },
  {
    title: "Rate-Limited Public API",
    prompt:
      "Design a public REST API platform for third-party developers, with API keys, per-key rate limits and usage metering.\n\n" +
      "Cover: authentication, where rate limiting lives, how you stay up under a misbehaving client or a DDoS, " +
      "usage metering at scale, and monitoring/alerting.",
    difficulty: "medium",
    requirements: { target_rps: 1_000_000, read_ratio: 0.8, peak_multiplier: 3, data_size_gb: 1_000, latency_slo_ms: 150, availability_slo: 99.99 },
  },
];

async function main() {
  await connectDatabase();

  const existing = await prisma.systemDesignProblem.count({ where: { company_id: null } });
  if (existing > 0) {
    logger.info(`${existing} system design preset(s) already seeded, skipping.`);
    await disconnectDatabase();
    return;
  }

  await prisma.systemDesignProblem.createMany({ data: PROBLEMS });
  logger.info(`Seeded ${PROBLEMS.length} system design presets.`);
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
