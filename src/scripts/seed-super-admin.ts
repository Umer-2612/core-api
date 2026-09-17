import "reflect-metadata";
import "@shared/config/env";
import {
  SUPER_ADMIN_COMPANY_NAME,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_PASSWORD,
} from "@shared/config/env";
import { Hash } from "@shared/utils/hash";
import { logger } from "@shared/utils/logger";
import { connectDatabase, disconnectDatabase, prisma } from "@/db/prisma";

async function main() {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD || !SUPER_ADMIN_NAME || !SUPER_ADMIN_COMPANY_NAME) {
    logger.error("Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME, SUPER_ADMIN_COMPANY_NAME to seed.");
    process.exit(1);
  }

  await connectDatabase();

  const existing = await prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL } });
  if (existing) {
    logger.info(`Super admin ${SUPER_ADMIN_EMAIL} already exists, skipping.`);
    await disconnectDatabase();
    return;
  }

  const passwordHash = await Hash.hashPassword(SUPER_ADMIN_PASSWORD);

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.upsert({
      where: { name: SUPER_ADMIN_COMPANY_NAME! },
      update: {},
      create: { name: SUPER_ADMIN_COMPANY_NAME! },
    });

    await tx.user.create({
      data: {
        company_id: company.id,
        full_name: SUPER_ADMIN_NAME!,
        email: SUPER_ADMIN_EMAIL!,
        password_hash: passwordHash,
        role: "super_admin",
      },
    });
  });

  logger.info(`Seeded super admin ${SUPER_ADMIN_EMAIL}`);
  await disconnectDatabase();
}

main().catch((err) => {
  logger.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
