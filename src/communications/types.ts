export type SmsRecipientReceipt = {
  phoneNumber: string;
  providerMessageId?: string;
  status: string;
  cost?: string;
};

export type SendSmsInput = {
  businessId: string;
  to: string[];
  message: string;
  from?: string;
  idempotencyKey: string;
};

export type SmsSendReceipt = {
  provider: "africas-talking" | "simulator";
  requestId?: string;
  recipients: SmsRecipientReceipt[];
  raw?: unknown;
};

export type InboundSms = {
  provider: "africas-talking" | "simulator";
  providerMessageId?: string;
  from: string;
  to: string;
  text: string;
  receivedAt: Date;
  raw: unknown;
};

export type SmsDeliveryUpdate = {
  provider: "africas-talking" | "simulator";
  providerMessageId: string;
  phoneNumber?: string;
  status: string;
  failureReason?: string;
  occurredAt: Date;
  raw: unknown;
};

/**
 * Providers only transport and normalize messages. Persistence, deduplication,
 * tenant matching, and domain side effects belong to the application layer.
 */
export interface MessagingAdapter {
  readonly provider: SmsSendReceipt["provider"];
  send(input: SendSmsInput): Promise<SmsSendReceipt>;
  receive(payload: unknown): InboundSms;
  delivery(payload: unknown): SmsDeliveryUpdate;
}
