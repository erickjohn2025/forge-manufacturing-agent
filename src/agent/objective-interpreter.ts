import OpenAI from "openai";
import { z } from "zod";
import { inferObjectiveDueDate } from "@/lib/dates";
import { logInfo, logWarn } from "@/lib/logger";

const resultSchema = z.object({
  desiredOutcome: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  domains: z.array(z.enum(["PLAN", "SOURCE", "MAKE", "DELIVER"])).min(1),
  confidence: z.number().min(0).max(1)
});

export type InterpretedObjective = z.infer<typeof resultSchema> & { source: "openai" | "deterministic-fallback" };

export async function interpretObjective(text: string, now = new Date()): Promise<InterpretedObjective> {
  const fallback: InterpretedObjective = {
    desiredOutcome: text.trim(),
    dueDate: inferObjectiveDueDate(text, now).toISOString().slice(0, 10),
    domains: ["PLAN", "SOURCE", "MAKE", "DELIVER"],
    confidence: 0.8,
    source: "deterministic-fallback"
  };
  logInfo("objective.interpret.started", { currentDate: now.toISOString(), textLength: text.length, fallbackDueDate: fallback.dueDate });
  if (!process.env.OPENAI_API_KEY) {
    logInfo("objective.interpret.completed", { source: fallback.source, dueDate: fallback.dueDate, reason: "openai_key_missing" });
    return fallback;
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4",
      store: false,
      input: [{ role: "system", content: "Interpret a manufacturing operations objective. Resolve relative dates using the supplied current date. Select every PLAN, SOURCE, MAKE, or DELIVER capability that may be needed to achieve the outcome; do not invent operational facts." },
        { role: "user", content: JSON.stringify({ objective: text, currentDate: now.toISOString().slice(0, 10) }) }],
      text: { format: { type: "json_schema", name: "manufacturing_objective", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: {
          desiredOutcome: { type: "string" }, dueDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          domains: { type: "array", items: { enum: ["PLAN", "SOURCE", "MAKE", "DELIVER"] } },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        }, required: ["desiredOutcome", "dueDate", "domains", "confidence"]
      } } }
    });
    const parsed = resultSchema.parse(JSON.parse(response.output_text));
    logInfo("objective.interpret.completed", { source: "openai", dueDate: parsed.dueDate, domains: parsed.domains, confidence: parsed.confidence });
    return { ...parsed, source: "openai" };
  } catch (error) {
    logWarn("objective.interpret.fallback", { reason: error instanceof Error ? error.message : String(error), dueDate: fallback.dueDate });
    return fallback;
  }
}
