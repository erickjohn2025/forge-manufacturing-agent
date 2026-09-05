export function isStockShortage(available: number, safetyStock: number) {
  return available < safetyStock;
}

export function scopeToTenant<T extends { businessId: string }>(rows: T[], businessId: string) {
  return rows.filter((row) => row.businessId === businessId);
}

export function floorHorizon(now = new Date(), days = 7) {
  return { from: now, to: new Date(now.getTime() + days * 86_400_000) };
}
