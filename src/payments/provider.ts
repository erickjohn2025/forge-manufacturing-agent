import { env } from "@/lib/env";
import { DemoPayProvider } from "./demo";
import type { PaymentProvider } from "./types";
import { ZenoPayProvider } from "./zenopay";

let provider: PaymentProvider | undefined;

export function getPaymentProvider(): PaymentProvider {
  provider ??= env.ZENOPAY_API_KEY ? new ZenoPayProvider() : new DemoPayProvider();
  return provider;
}

export function normalizeTzPhone(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d+]/g, "");
  const match = /^(?:\+?255|0)(\d{9})$/.exec(digits);
  return match ? `0${match[1]}` : null;
}
