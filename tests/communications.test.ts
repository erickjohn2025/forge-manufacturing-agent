import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AfricasTalkingSmsAdapter,
  SimulatorSmsAdapter,
  getSipBridgeConfig,
  smsPayloadFingerprint,
  verifyVapiWebhook,
} from "@/communications";

describe("SMS adapters", () => {
  it("gives simulator sends stable provider IDs for an idempotency key", async () => {
    const adapter = new SimulatorSmsAdapter();
    const input = {
      businessId: "biz-1",
      to: ["255 700 000 001"],
      message: " RFQ-104   needs packaging ",
      idempotencyKey: "rfq-104:supplier-1",
    };

    const first = await adapter.send(input);
    const second = await adapter.send(input);

    expect(first.recipients[0].providerMessageId).toBe(second.recipients[0].providerMessageId);
    expect(first.recipients[0].phoneNumber).toBe("+255700000001");
    expect(adapter.sent).toHaveLength(2);
  });

  it("normalizes Africa's Talking send responses and inbound messages", async () => {
    const send = vi.fn().mockResolvedValue({
      SMSMessageData: {
        Message: "Sent to 1/1",
        Recipients: [{
          number: "+255700000001",
          messageId: "at-message-1",
          status: "Success",
          cost: "TZS 10",
        }],
      },
    });
    const adapter = new AfricasTalkingSmsAdapter(
      { username: "demo", apiKey: "secret", senderId: "Factory" },
      { send },
    );

    const receipt = await adapter.send({
      businessId: "biz-1",
      to: ["+255700000001"],
      message: "Request quote",
      idempotencyKey: "rfq-1",
    });
    const inbound = adapter.receive({
      id: "reply-1",
      from: "255700000001",
      to: "+255711111111",
      text: " 575 each.  Monday morning. ",
      date: "2026-09-04T07:00:00.000Z",
    });

    expect(send).toHaveBeenCalledWith({
      to: ["+255700000001"],
      message: "Request quote",
      from: "Factory",
    });
    expect(receipt.recipients[0]).toMatchObject({ providerMessageId: "at-message-1", status: "Success" });
    expect(inbound).toMatchObject({
      providerMessageId: "reply-1",
      from: "+255700000001",
      text: "575 each. Monday morning.",
    });
  });

  it("retries transient Africa's Talking transport failures", async () => {
    const transientError = Object.assign(new Error("temporary TLS failure"), { code: "EPROTO" });
    const send = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({
        SMSMessageData: {
          Message: "Sent to 1/1",
          Recipients: [{ number: "+255700000001", messageId: "retry-message-1", status: "Success" }],
        },
      });
    const adapter = new AfricasTalkingSmsAdapter(
      { username: "sandbox", apiKey: "secret", retryDelaysMs: [0] },
      { send },
    );

    const receipt = await adapter.send({
      businessId: "biz-1",
      to: ["+255700000001"],
      message: "Retry me",
      idempotencyKey: "retry-1",
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(receipt.recipients[0].providerMessageId).toBe("retry-message-1");
  });

  it("formats a normalized inbound shortcode for outbound replies", async () => {
    const send = vi.fn().mockResolvedValue({
      SMSMessageData: { Message: "Sent to 1/1", Recipients: [{ number: "+255700000001", messageId: "reply-1", status: "Success" }] },
    });
    const adapter = new AfricasTalkingSmsAdapter({ username: "sandbox", apiKey: "secret" }, { send });
    await adapter.send({ businessId: "biz-1", from: "+3010", to: ["+255700000001"], message: "Reply", idempotencyKey: "reply-1" });
    expect(send).toHaveBeenCalledWith({ to: ["+255700000001"], message: "Reply", from: "3010" });
  });
});

describe("inbound deduplication", () => {
  it("prefers the provider ID and otherwise hashes normalized content", () => {
    const identified = smsPayloadFingerprint({
      provider: "africas-talking",
      providerMessageId: "message-1",
      from: "+255700000001",
      to: "+255711111111",
      text: "hello",
    });
    expect(identified).toBe("africas-talking:message-1");

    const one = smsPayloadFingerprint({
      provider: "simulator",
      from: "+255 700 000 001",
      to: "+255711111111",
      text: "  I can do 540 each  ",
      receivedAt: new Date("2026-09-04T10:20:10Z"),
    });
    const two = smsPayloadFingerprint({
      provider: "simulator",
      from: "255700000001",
      to: "255 711 111 111",
      text: "i can do 540   each",
      receivedAt: new Date("2026-09-04T10:20:55Z"),
    });
    expect(one).toBe(two);
  });
});

describe("Vapi bridge helpers", () => {
  it("verifies bearer secrets and HMAC signatures", () => {
    expect(verifyVapiWebhook({
      rawBody: "{}",
      expectedSecret: "secret",
      authorization: "Bearer secret",
    })).toBe(true);

    const rawBody = '{"message":{"type":"status-update"}}';
    const signature = createHmac("sha256", "secret").update(rawBody).digest("hex");
    expect(verifyVapiWebhook({ rawBody, expectedSecret: "secret", signature: `sha256=${signature}` })).toBe(true);
    expect(verifyVapiWebhook({ rawBody, expectedSecret: "secret", signature: "sha256=00" })).toBe(false);
  });

  it("only enables the SIP bridge with complete valid configuration", () => {
    expect(getSipBridgeConfig({})).toBeNull();
    expect(getSipBridgeConfig({
      AT_VOICE_NUMBER: "+255711111111",
      VAPI_SIP_URI: "sip:factory@sip.vapi.ai",
      VAPI_ASSISTANT_ID: "assistant-1",
    })).toEqual({
      africasTalkingVoiceNumber: "+255711111111",
      vapiSipUri: "sip:factory@sip.vapi.ai",
      vapiAssistantId: "assistant-1",
    });
  });
});
