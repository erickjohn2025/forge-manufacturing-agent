import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { getInventoryPosition, getMaterialPosition } from "@/domain/planning";
import { numberOf } from "@/domain/shared";
import { floorHorizon, isStockShortage, scopeToTenant } from "@/lib/floor-summary";

export async function GET() {
  try {
    const { businessId } = await requireTenant();
    const { from, to } = floorHorizon();
    const [orders, products, materials, business, pendingApprovals, openRfqs, purchaseOrdersInFlight, activeJobs, events] = await Promise.all([
      db.customerOrder.findMany({
        where: { businessId, dueAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        include: { customer: true, lines: true },
        orderBy: { dueAt: "asc" },
      }),
      db.product.findMany({ where: { businessId, active: true }, orderBy: { sku: "asc" } }),
      db.material.findMany({ where: { businessId }, orderBy: { sku: "asc" } }),
      db.business.findUniqueOrThrow({ where: { id: businessId } }),
      db.approvalRequest.count({ where: { businessId, status: "PENDING" } }),
      db.rfq.count({ where: { businessId, status: { in: ["DRAFT", "SENT", "QUOTING"] } } }),
      db.purchaseOrder.count({ where: { businessId, status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] } } }),
      db.productionJob.count({ where: { businessId, status: { in: ["PLANNED", "MATERIALS_ALLOCATED", "READY", "IN_PROGRESS"] } } }),
      db.agentActionEvent.findMany({ where: { businessId }, orderBy: { occurredAt: "desc" }, take: 10 }),
    ]);

    const finishedGoods = await Promise.all(products.map(async (product) => {
      const position = await getInventoryPosition(db, businessId, "PRODUCT", product.id);
      const safetyStock = numberOf(business.defaultSafetyStock);
      return {
        id: product.id, kind: "PRODUCT" as const, sku: product.sku, name: product.name, unit: product.unit,
        ...position, safetyStock, shortage: isStockShortage(position.available, safetyStock),
      };
    }));
    const materialStock = await Promise.all(materials.map(async (material) => {
      const position = await getMaterialPosition(db, businessId, material.id);
      const safetyStock = numberOf(material.safetyStock ?? business.defaultSafetyStock);
      return {
        id: material.id, kind: "MATERIAL" as const, sku: material.sku, name: material.name, unit: material.unit,
        ...position, safetyStock, shortage: isStockShortage(position.available, safetyStock),
      };
    }));
    const stock = [...finishedGoods, ...materialStock];
    const tenantEvents = scopeToTenant(events, businessId);

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id, code: order.code, customer: order.customer.name, dueAt: order.dueAt.toISOString(),
        status: order.status, lineCount: order.lines.length,
        ordered: order.lines.reduce((sum, line) => sum + numberOf(line.quantity), 0),
        allocated: order.lines.reduce((sum, line) => sum + numberOf(line.allocatedQuantity), 0),
      })),
      stock,
      counts: {
        ordersDue: orders.length,
        shortages: stock.filter((item) => item.shortage).length,
        pendingApprovals, openRfqs, purchaseOrdersInFlight, activeJobs,
      },
      events: tenantEvents.map((event) => ({
        id: event.id, domain: event.domain, status: event.status, title: event.title,
        detail: event.detail ?? undefined, toolName: event.toolName ?? undefined, occurredAt: event.occurredAt.toISOString(),
      })),
    });
  } catch (error) { return apiError(error); }
}
