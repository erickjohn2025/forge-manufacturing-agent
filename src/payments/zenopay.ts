import { env } from "@/lib/env";
import type { CreateCollectionInput, PaymentProvider, ProviderPaymentStatus } from "./types";

export function normalizeProviderStatus(value: unknown): ProviderPaymentStatus {
  const status = String(value ?? "").toUpperCase();
  if (status === "COMPLETED" || status === "SUCCESS" || status === "SUCCESSFUL") return "completed";
  if (status === "FAILED" || status === "CANCELLED" || status === "CANCELED") return "failed";
  if (status) return "pending";
  return "unknown";
}

export class ZenoPayProvider implements PaymentProvider {
  readonly name = "zenopay";

  private headers() {
    return { "content-type": "application/json", "x-api-key": env.ZENOPAY_API_KEY! };
  }

  async createCollection(input: CreateCollectionInput): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(`${env.ZENOPAY_API_BASE}/api/payments/mobile_money_tanzania`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        order_id: input.orderId,
        buyer_email: input.payerEmail,
        buyer_name: input.payerName,
        buyer_phone: input.payerPhone,
        amount: input.amountTzs,
        ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
        metadata: { purchase_payment_id: input.orderId },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text().catch(() => "");
    if (!response.ok) return { ok: false, message: `ZenoPay rejected the collection (${response.status}): ${body.slice(0, 160)}` };
    return { ok: true, message: "Payment prompt sent. Approve it using the mobile-money PIN on the manufacturer's phone." };
  }

  async checkStatus(orderId: string): Promise<{ status: ProviderPaymentStatus; reference?: string }> {
    const response = await fetch(
      `${env.ZENOPAY_API_BASE}/api/payments/order-status?order_id=${encodeURIComponent(orderId)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return { status: "unknown" };
    const body = (await response.json().catch(() => null)) as {
      data?: Array<{ payment_status?: string; reference?: string }>;
    } | null;
    const result = body?.data?.[0];
    return { status: normalizeProviderStatus(result?.payment_status), reference: result?.reference };
  }
}
