import { createHash } from "node:crypto";

export function maskPhone(phone: string) {
  if (!phone) return "";
  if (phone.length < 8) return `${phone.slice(0, 2)}••••`;
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

export function counterpartOf(direction: string, fromAddress: string, toAddress: string) {
  return direction === "INBOUND" ? fromAddress : toAddress;
}

export function phoneThreadKey(businessId: string, counterpart: string) {
  return createHash("sha256").update(`${businessId}\0${counterpart}`).digest("hex").slice(0, 24);
}
