import { createHash, timingSafeEqual } from "node:crypto";

export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) throw new Error("Phone number is empty");
  return `+${digits}`;
}

export function normalizeMessageText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function smsPayloadFingerprint(input: {
  provider: string;
  providerMessageId?: string;
  from: string;
  to: string;
  text: string;
  receivedAt?: Date;
}): string {
  if (input.providerMessageId) {
    return `${input.provider}:${input.providerMessageId}`;
  }

  const minute = input.receivedAt
    ? input.receivedAt.toISOString().slice(0, 16)
    : "unknown-time";
  const canonical = [
    input.provider,
    normalizePhoneNumber(input.from),
    normalizePhoneNumber(input.to),
    normalizeMessageText(input.text).toLocaleLowerCase("en"),
    minute,
  ].join("|");

  return `${input.provider}:sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function constantTimeSecretEquals(actual: string | null | undefined, expected: string): boolean {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
