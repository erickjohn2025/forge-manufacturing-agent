import OpenAI from "openai";
import { z } from "zod";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const extractedQuoteSchema = z.object({
  unitPrice: z.number().positive().nullable(),
  currency: z.string().min(3).max(3).nullable(),
  quantityAvailable: z.number().positive().nullable(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.enum(["unitPrice", "currency", "quantityAvailable", "deliveryDate"])),
});

export type ExtractedSupplierQuote = z.infer<typeof extractedQuoteSchema> & {
  source: "openai" | "deterministic-fallback";
};

export type QuoteExtractionContext = {
  message: string;
  requestedQuantity: number;
  defaultCurrency: string;
  businessTimeZone: string;
  referenceAt?: Date;
};

type ResponsesClient = {
  responses: {
    create(input: Record<string, unknown>): Promise<{ output_text?: string }>;
  };
};

export type QuoteExtractorOptions = {
  client?: ResponsesClient;
  apiKey?: string;
  model?: string;
};

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    unitPrice: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    quantityAvailable: { type: ["number", "null"] },
    deliveryDate: { type: ["string", "null"], description: "ISO calendar date YYYY-MM-DD" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    missingFields: {
      type: "array",
      items: { enum: ["unitPrice", "currency", "quantityAvailable", "deliveryDate"] },
    },
  },
  required: ["unitPrice", "currency", "quantityAvailable", "deliveryDate", "confidence", "missingFields"],
} as const;

export class SupplierQuoteExtractor {
  private readonly client?: ResponsesClient;
  private readonly model: string;

  constructor(options: QuoteExtractorOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.client = options.client ?? (apiKey ? new OpenAI({ apiKey }) : undefined);
    this.model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5.4";
  }

  async extract(context: QuoteExtractionContext): Promise<ExtractedSupplierQuote> {
    if (!context.message.trim()) throw new Error("Supplier message is empty");
    if (!(context.requestedQuantity > 0)) throw new Error("Requested quantity must be positive");

    if (this.client) {
      try {
        const referenceAt = context.referenceAt ?? new Date();
        const response = await this.client.responses.create({
          model: this.model,
          store: false,
          input: [
            {
              role: "system",
              content: "Extract only the supplier's quotation. Do not infer a price or delivery date. If the supplier offers the RFQ without an explicit quantity, use the requested quantity. Resolve relative dates using the supplied local reference date. Return the configured default currency only when a price is present and no other currency is stated.",
            },
            {
              role: "user",
              content: JSON.stringify({
                supplierMessage: context.message,
                requestedQuantity: context.requestedQuantity,
                defaultCurrency: context.defaultCurrency.toUpperCase(),
                businessTimeZone: context.businessTimeZone,
                localReferenceDate: localDate(referenceAt, context.businessTimeZone),
              }),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "supplier_quote",
              strict: true,
              schema: jsonSchema,
            },
          },
        });
        if (!response.output_text) throw new Error("OpenAI returned no structured output");
        const parsed = extractedQuoteSchema.parse(JSON.parse(response.output_text));
        return { ...normalizeExtracted(parsed, context), source: "openai" };
      } catch {
        // Provider failures must not discard an inbound supplier message. The
        // deterministic parser returns incomplete fields for clarification.
      }
    }

    return extractQuoteDeterministically(context);
  }
}

export function extractQuoteDeterministically(context: QuoteExtractionContext): ExtractedSupplierQuote {
  const message = context.message.trim();
  const unitPrice = extractUnitPrice(message);
  const deliveryDate = extractDeliveryDate(
    message,
    context.referenceAt ?? new Date(),
    context.businessTimeZone,
  );
  const explicitlyLimitedQuantity = extractAvailableQuantity(message);
  const quantityAvailable = explicitlyLimitedQuantity ?? context.requestedQuantity;
  const currency = unitPrice === null ? null : extractCurrency(message) ?? context.defaultCurrency.toUpperCase();
  const missingFields: Array<"unitPrice" | "currency" | "quantityAvailable" | "deliveryDate"> = [];
  if (unitPrice === null) missingFields.push("unitPrice");
  if (currency === null) missingFields.push("currency");
  if (quantityAvailable === null) missingFields.push("quantityAvailable");
  if (deliveryDate === null) missingFields.push("deliveryDate");

  const found = 4 - missingFields.length;
  return {
    unitPrice,
    currency,
    quantityAvailable,
    deliveryDate,
    confidence: Number((found / 4 * (explicitlyLimitedQuantity === null ? 0.92 : 1)).toFixed(2)),
    missingFields,
    source: "deterministic-fallback",
  };
}

function normalizeExtracted(
  extracted: z.infer<typeof extractedQuoteSchema>,
  context: QuoteExtractionContext,
): z.infer<typeof extractedQuoteSchema> {
  const unitPrice = extracted.unitPrice;
  const currency = unitPrice === null
    ? null
    : (extracted.currency ?? context.defaultCurrency).toUpperCase();
  const quantityAvailable = extracted.quantityAvailable ?? context.requestedQuantity;
  const missingFields = extracted.missingFields.filter((field) => {
    if (field === "currency") return currency === null;
    if (field === "quantityAvailable") return quantityAvailable === null;
    return extracted[field] === null;
  });
  return { ...extracted, currency, quantityAvailable, missingFields };
}

function extractUnitPrice(message: string): number | null {
  const patterns = [
    /(?:tzs|tsh|kes|usd|shillings?)?\s*([\d,]+(?:\.\d+)?)\s*(?:each|per\s+(?:unit|piece|item|packaging)|\/\s*(?:unit|piece|item))/i,
    /(?:unit\s+price|price|quote|rate)\s*(?:is|:|=|at)?\s*(?:tzs|tsh|kes|usd|shillings?)?\s*([\d,]+(?:\.\d+)?)/i,
    /(?:tzs|tsh|kes|usd)\s*([\d,]+(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return parseNumeric(match[1]);
  }
  return null;
}

function extractAvailableQuantity(message: string): number | null {
  const patterns = [
    /(?:can\s+(?:supply|provide)|available|up\s+to|quantity)\s*(?:is|:|=)?\s*([\d,]+(?:\.\d+)?)\s*(?:units?|pieces?|pcs?|packs?|packaging)?/i,
    /([\d,]+(?:\.\d+)?)\s*(?:units?|pieces?|pcs?|packs?)\s+(?:available|only)/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return parseNumeric(match[1]);
  }
  return null;
}

function extractCurrency(message: string): string | null {
  if (/\b(?:tzs|tsh|tanzanian\s+shillings?)\b/i.test(message)) return "TZS";
  if (/\b(?:kes|ksh|kenyan\s+shillings?)\b/i.test(message)) return "KES";
  if (/\b(?:usd|us\$)\b|\$/i.test(message)) return "USD";
  return null;
}

function extractDeliveryDate(message: string, referenceAt: Date, timeZone: string): string | null {
  const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso && isCalendarDate(iso[1])) return iso[1];

  const relative = message.match(/\b(today|tomorrow)\b/i)?.[1]?.toLowerCase();
  if (relative) return addCalendarDays(localDate(referenceAt, timeZone), relative === "tomorrow" ? 1 : 0);

  const weekdayMatch = message.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1]?.toLowerCase();
  if (!weekdayMatch) return null;
  const baseDate = localDate(referenceAt, timeZone);
  const currentWeekday = new Date(`${baseDate}T12:00:00.000Z`).getUTCDay();
  const targetWeekday = WEEKDAYS.indexOf(weekdayMatch as (typeof WEEKDAYS)[number]);
  const offset = (targetWeekday - currentWeekday + 7) % 7;
  return addCalendarDays(baseDate, offset);
}

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Error(`Unable to resolve date in timezone ${timeZone}`);
  return `${year}-${month}-${day}`;
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parseNumeric(value: string): number | null {
  const result = Number(value.replace(/,/g, ""));
  return Number.isFinite(result) && result > 0 ? result : null;
}
