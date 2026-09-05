import nextEnv from "@next/env";
import type { Job } from "pg-boss";

// The worker runs outside the Next.js runtime, so load the same .env files
// before Prisma, pg-boss, and communication adapters read process.env.
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const [{ getBoss, OBJECTIVE_JOB }, { runObjectiveCycle }, { logError, logInfo }] = await Promise.all([
    import("@/agent/queue"),
    import("@/agent/engine"),
    import("@/lib/logger"),
  ]);
  const boss = await getBoss();
  await boss.work<{ objectiveId: string }>(OBJECTIVE_JOB, async ([job]: Job<{ objectiveId: string }>[]) => {
    const startedAt = Date.now();
    logInfo("worker.objective.started", { jobId: job.id, objectiveId: job.data.objectiveId });
    try {
      await runObjectiveCycle(job.data.objectiveId);
      logInfo("worker.objective.completed", { jobId: job.id, objectiveId: job.data.objectiveId, durationMs: Date.now() - startedAt });
    } catch (error) {
      logError("worker.objective.failed", error, { jobId: job.id, objectiveId: job.data.objectiveId, durationMs: Date.now() - startedAt });
      throw error;
    }
  });
  logInfo("worker.started", { queue: OBJECTIVE_JOB });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
