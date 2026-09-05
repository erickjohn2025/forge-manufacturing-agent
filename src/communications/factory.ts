import type { MessagingAdapter } from "./types";
import { AfricasTalkingSmsAdapter } from "./africas-talking";
import { SimulatorSmsAdapter } from "./simulator";
import { env } from "@/lib/env";

let adapter: MessagingAdapter | undefined;

export function getMessagingAdapter(): MessagingAdapter {
  if (adapter) return adapter;
  if (env.SMS_PROVIDER === "africas-talking") {
    if (!env.AFRICASTALKING_USERNAME || !env.AFRICASTALKING_API_KEY) {
      throw new Error("Africa's Talking credentials are required when SMS_PROVIDER=africas-talking");
    }
    adapter = new AfricasTalkingSmsAdapter({
      username: env.AFRICASTALKING_USERNAME,
      apiKey: env.AFRICASTALKING_API_KEY,
      senderId: env.AFRICASTALKING_SENDER_ID || undefined
    });
  } else {
    adapter = new SimulatorSmsAdapter();
  }
  return adapter;
}
