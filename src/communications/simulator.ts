import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeMessageText, normalizePhoneNumber } from "./normalization";
import type { InboundSms, MessagingAdapter, SendSmsInput, SmsDeliveryUpdate, SmsSendReceipt } from "./types";

const inboundSchema = z.object({
  id: z.string().min(1).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  text: z.string().min(1),
  receivedAt: z.coerce.date().optional(),
});

const deliverySchema = z.object({
  id: z.string().min(1),
  phoneNumber: z.string().min(1).optional(),
  status: z.string().min(1),
  failureReason: z.string().optional(),
  occurredAt: z.coerce.date().optional(),
});

export class SimulatorSmsAdapter implements MessagingAdapter {
  readonly provider = "simulator" as const;
  readonly sent: Array<SendSmsInput & { receipt: SmsSendReceipt }> = [];

  async send(input: SendSmsInput): Promise<SmsSendReceipt> {
    if (input.to.length === 0) throw new Error("At least one SMS recipient is required");
    if (!normalizeMessageText(input.message)) throw new Error("SMS message is empty");

    const recipients = input.to.map((phoneNumber, index) => ({
      phoneNumber: normalizePhoneNumber(phoneNumber),
      providerMessageId: `sim-${createHash("sha256")
        .update(`${input.idempotencyKey}:${index}`)
        .digest("hex")
        .slice(0, 20)}`,
      status: "Sent",
    }));
    const receipt: SmsSendReceipt = {
      provider: this.provider,
      requestId: `sim-request-${createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 16)}`,
      recipients,
    };
    this.sent.push({ ...input, to: recipients.map((recipient) => recipient.phoneNumber), receipt });
    return receipt;
  }

  receive(payload: unknown): InboundSms {
    const value = inboundSchema.parse(payload);
    return {
      provider: this.provider,
      providerMessageId: value.id,
      from: normalizePhoneNumber(value.from),
      to: normalizePhoneNumber(value.to),
      text: normalizeMessageText(value.text),
      receivedAt: value.receivedAt ?? new Date(),
      raw: payload,
    };
  }

  delivery(payload: unknown): SmsDeliveryUpdate {
    const value = deliverySchema.parse(payload);
    return {
      provider: this.provider,
      providerMessageId: value.id,
      phoneNumber: value.phoneNumber ? normalizePhoneNumber(value.phoneNumber) : undefined,
      status: value.status,
      failureReason: value.failureReason,
      occurredAt: value.occurredAt ?? new Date(),
      raw: payload,
    };
  }
}
