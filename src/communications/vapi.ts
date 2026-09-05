import { z } from "zod";

export const vapiWebhookSchema = z.object({
  message: z.object({
    type: z.string().min(1),
    call: z.object({ id: z.string().min(1) }).passthrough().optional(),
    transcript: z.string().optional(),
    status: z.string().optional(),
    toolCallList: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      arguments: z.unknown().optional(),
    }).passthrough()).optional(),
  }).passthrough(),
}).passthrough();

export type VapiWebhookEvent = z.infer<typeof vapiWebhookSchema>;

export function parseVapiWebhook(payload: unknown): VapiWebhookEvent {
  return vapiWebhookSchema.parse(payload);
}

export type SipBridgeConfig = {
  africasTalkingVoiceNumber: string;
  vapiSipUri: string;
  vapiAssistantId: string;
};

export function getSipBridgeConfig(env: Record<string, string | undefined> = process.env): SipBridgeConfig | null {
  const africasTalkingVoiceNumber = env.AT_VOICE_NUMBER?.trim();
  const vapiSipUri = env.VAPI_SIP_URI?.trim();
  const vapiAssistantId = env.VAPI_ASSISTANT_ID?.trim();
  if (!africasTalkingVoiceNumber || !vapiSipUri || !vapiAssistantId) return null;
  if (!vapiSipUri.startsWith("sip:")) throw new Error("VAPI_SIP_URI must begin with sip:");
  return { africasTalkingVoiceNumber, vapiSipUri, vapiAssistantId };
}
