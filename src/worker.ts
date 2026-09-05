import nextEnv from "@next/env";
import type { Job } from "pg-boss";

// The worker runs outside the Next.js runtime, so load the same .env files
// before Prisma, pg-boss, and communication adapters read process.env.
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const [{ getBoss, OBJECTIVE_JOB }, { runObjectiveCycle }] = await Promise.all([
    import("@/agent/queue"),
    import("@/agent/engine"),
  ]);
  const boss = await getBoss();
  await boss.work<{ objectiveId: string }>(OBJECTIVE_JOB, async ([job]: Job<{ objectiveId: string }>[]) => {
    await runObjectiveCycle(job.data.objectiveId);
  });
  console.log("Objective worker started");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
