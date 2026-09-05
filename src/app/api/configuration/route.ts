import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { normalizeTzPhone } from "@/payments/provider";

function maskPhone(phone?: string | null) {
  return phone ? `${phone.slice(0, 4)}•••${phone.slice(-3)}` : undefined;
}

const patchSchema = z.object({
  autoPurchaseLimit: z.number().finite().nonnegative().optional(),
  defaultSafetyStock: z.number().finite().nonnegative().optional(),
  manufacturerPaymentPhone: z.string().trim().min(1).max(30).optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Provide at least one configuration value",
});

export async function GET() {
  try {
    const { businessId, role } = await requireTenant();
    const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, include: { memberships: { include: { user: true } } } });
    const smsUsers = business.memberships.filter((membership) => membership.user.phone).map((membership) => ({
      name: membership.user.name, role: membership.role,
      phone: `${membership.user.phone!.slice(0, 4)}••••${membership.user.phone!.slice(-3)}`,
    }));
    const webhookBaseUrl = process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.APP_URL || "";
    const callbackUrl = webhookBaseUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(webhookBaseUrl)
      ? `${webhookBaseUrl.replace(/\/$/, "")}/api/webhooks/africas-talking/sms`
      : undefined;
    const callbackStable = Boolean(callbackUrl && !callbackUrl.includes("trycloudflare.com"));
    return NextResponse.json({
      businessName: business.name, currency: business.currency, timezone: business.timezone,
      autoPurchaseLimit: Number(business.autoPurchaseLimit), defaultSafetyStock: Number(business.defaultSafetyStock),
      messagingMode: process.env.SMS_PROVIDER === "africas-talking" ? "Africa's Talking" : "Simulator",
      smsConfigured: process.env.SMS_PROVIDER === "africas-talking" && Boolean(process.env.AFRICASTALKING_API_KEY),
      inboundNumber: business.inboundNumber, smsUsers, callbackUrl, callbackStable,
      manufacturerPaymentPhone: role === "ADMIN" ? business.manufacturerPaymentPhone : maskPhone(business.manufacturerPaymentPhone),
      canManagePayments: role === "ADMIN",
      canManagePolicy: role === "ADMIN",
      paymentMode: process.env.ZENOPAY_API_KEY ? "ZenoPay" : "Demo",
      demoResetEnabled: process.env.DEMO_MODE === "true",
    });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const { businessId } = await requireTenant(["ADMIN"]);
    const input = patchSchema.parse(await request.json());
    const phone = input.manufacturerPaymentPhone === undefined
      ? undefined
      : normalizeTzPhone(input.manufacturerPaymentPhone);
    if (input.manufacturerPaymentPhone !== undefined && !phone) {
      throw new ApiError(422, "Enter a Tanzanian number, for example 0768967257");
    }
    const business = await db.business.update({
      where: { id: businessId },
      data: {
        ...(input.autoPurchaseLimit !== undefined ? { autoPurchaseLimit: input.autoPurchaseLimit } : {}),
        ...(input.defaultSafetyStock !== undefined ? { defaultSafetyStock: input.defaultSafetyStock } : {}),
        ...(phone !== undefined ? { manufacturerPaymentPhone: phone } : {}),
      },
    });
    return NextResponse.json({
      autoPurchaseLimit: Number(business.autoPurchaseLimit),
      defaultSafetyStock: Number(business.defaultSafetyStock),
      manufacturerPaymentPhone: business.manufacturerPaymentPhone,
    });
  } catch (error) { return apiError(error); }
}
