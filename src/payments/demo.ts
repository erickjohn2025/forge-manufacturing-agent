import type { CreateCollectionInput, PaymentProvider } from "./types";

const DEMO_SETTLE_MS = 12_000;

export class DemoPayProvider implements PaymentProvider {
  readonly name = "demo";

  async createCollection(_input: CreateCollectionInput) {
    return { ok: true, message: "Demo payment prompt sent. It will confirm automatically in about 12 seconds; no money is moved." };
  }

  async checkStatus(orderId: string, createdAt?: Date) {
    if (!createdAt) return { status: "unknown" as const };
    const completed = Date.now() - createdAt.getTime() >= DEMO_SETTLE_MS;
    return { status: completed ? "completed" as const : "pending" as const, reference: completed ? `DEMO-${orderId}` : undefined };
  }
}
