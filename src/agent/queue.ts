import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { logInfo } from "@/lib/logger";

export const OBJECTIVE_JOB = "objective-cycle";
let bossPromise: Promise<PgBoss> | undefined;

export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({ connectionString: env.DATABASE_URL });
      await boss.start();
      await boss.createQueue(OBJECTIVE_JOB);
      return boss;
    })();
  }
  return bossPromise;
}

export async function enqueueObjective(objectiveId: string) {
  const boss = await getBoss();
  const jobId = await boss.send(OBJECTIVE_JOB, { objectiveId }, {
    singletonKey: objectiveId,
    retryLimit: 3,
    retryDelay: 5,
    expireInSeconds: 300
  });
  logInfo("objective.queued", { objectiveId, jobId });
}
