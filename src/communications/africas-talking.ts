import AfricasTalking from "africastalking";
import { z } from "zod";
import { normalizeMessageText, normalizePhoneNumber } from "./normalization";
import type { InboundSms, MessagingAdapter, SendSmsInput, SmsDeliveryUpdate, SmsSendReceipt } from "./types";

type AfricaTalkingSmsClient = {
  send(input: { to: string[]; message: string; from?: string; enqueue?: boolean }): Promise<unknown>;
};

const inboundSchema = z.object({
  id: z.string().min(1).optional(),
  linkId: z.string().optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  text: z.string().min(1),
  date: z.coerce.date().optional(),
});

const deliverySchema = z.object({
  id: z.string().min(1),
  phoneNumber: z.string().min(1).optional(),
  status: z.string().min(1),
  failureReason: z.string().optional(),
  retryCount: z.union([z.string(), z.number()]).optional(),
  date: z.coerce.date().optional(),
});

const responseSchema = z.object({
  SMSMessageData: z.object({
    Message: z.string().optional(),
    Recipients: z.array(z.object({
      number: z.string(),
      messageId: z.string().optional(),
      status: z.string(),
      cost: z.string().optional(),
    })),
  }),
});

export type AfricasTalkingSmsConfig = {
  username: string;
  apiKey: string;
  senderId?: string;
  retryDelaysMs?: number[];
};

function isTransientSendError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; response?: { status?: number } };
  if (["ECONNRESET", "ETIMEDOUT", "EPROTO", "EAI_AGAIN", "ENETUNREACH"].includes(value.code ?? "")) return true;
  const status = value.response?.status;
  return status === 429 || Boolean(status && status >= 500);
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const providerSenderAddress = (value: string) => /^\+\d{3,6}$/.test(value) ? value.slice(1) : value;

export class AfricasTalkingSmsAdapter implements MessagingAdapter {
  readonly provider = "africas-talking" as const;
  private readonly sms: AfricaTalkingSmsClient;

  constructor(private readonly config: AfricasTalkingSmsConfig, client?: AfricaTalkingSmsClient) {
    this.sms = client ?? AfricasTalking({ username: config.username, apiKey: config.apiKey }).SMS;
  }

  async send(input: SendSmsInput): Promise<SmsSendReceipt> {
    const to = input.to.map(normalizePhoneNumber);
    if (to.length === 0) throw new Error("At least one SMS recipient is required");
    const message = normalizeMessageText(input.message);
    if (!message) throw new Error("SMS message is empty");

    const from = input.from ?? this.config.senderId;
    const request = {
      to,
      message,
      ...(from ? { from: providerSenderAddress(from) } : {}),
    };
    const retryDelays = this.config.retryDelaysMs ?? [250, 1_000];
    let raw: unknown;
    for (let attempt = 0; ; attempt += 1) {
      try {
        raw = await this.sms.send(request);
        break;
      } catch (error) {
        if (attempt >= retryDelays.length || !isTransientSendError(error)) throw error;
        await wait(retryDelays[attempt]);
      }
    }
    const parsed = responseSchema.parse(raw);
    return {
      provider: this.provider,
      recipients: parsed.SMSMessageData.Recipients.map((recipient) => ({
        phoneNumber: normalizePhoneNumber(recipient.number),
        providerMessageId: recipient.messageId,
        status: recipient.status,
        cost: recipient.cost,
      })),
      raw,
    };
  }

  receive(payload: unknown): InboundSms {
    const value = inboundSchema.parse(payload);
    return {
      provider: this.provider,
      providerMessageId: value.id,
      from: normalizePhoneNumber(value.from),
      to: normalizePhoneNumber(value.to),
      text: normalizeMessageText(value.text),
      receivedAt: value.date ?? new Date(),
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
      occurredAt: value.date ?? new Date(),
      raw: payload,
    };
  }
}
