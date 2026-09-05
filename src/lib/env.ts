import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16).default("development-only-change-me"),
  APP_URL: optionalUrl.default("http://localhost:3000"),
  PUBLIC_WEBHOOK_BASE_URL: optionalUrl.default(""),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  SMS_PROVIDER: z.enum(["simulator", "africas-talking"]).default("simulator"),
  SIMULATOR_WEBHOOK_SECRET: z.string().default("development-simulator-secret"),
  AFRICASTALKING_USERNAME: z.string().optional(),
  AFRICASTALKING_API_KEY: z.string().optional(),
  AFRICASTALKING_SENDER_ID: z.string().optional(),
  AFRICASTALKING_INBOUND_NUMBER: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  VAPI_WEBHOOK_SECRET: z.string().optional(),
  VAPI_SIP_URI: z.string().optional()
});

export const env = schema.parse({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://manufacturing:manufacturing@localhost:5432/manufacturing"
});

export const isDemoMode = env.DEMO_MODE === "true";
