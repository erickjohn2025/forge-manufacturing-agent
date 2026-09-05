import { createHmac, timingSafeEqual } from "node:crypto";
import { constantTimeSecretEquals } from "./normalization";

function stripBearer(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^Bearer\s+/i, "").trim();
}

export function verifySharedSecret(input: {
  expectedSecret: string;
  authorization?: string | null;
  secretHeader?: string | null;
}): boolean {
  return constantTimeSecretEquals(stripBearer(input.authorization), input.expectedSecret)
    || constantTimeSecretEquals(input.secretHeader, input.expectedSecret);
}

/** Supports signed Vapi webhooks when configured, while also allowing its server URL secret. */
export function verifyVapiWebhook(input: {
  rawBody: string;
  expectedSecret: string;
  authorization?: string | null;
  secretHeader?: string | null;
  signature?: string | null;
}): boolean {
  if (verifySharedSecret(input)) return true;
  if (!input.signature) return false;

  const supplied = input.signature.replace(/^sha256=/i, "");
  const expected = createHmac("sha256", input.expectedSecret).update(input.rawBody).digest("hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
