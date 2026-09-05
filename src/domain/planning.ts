import type { PrismaClient } from "@prisma/client";
import type { ToolResult } from "@/lib/contracts";
import { type DbClient, numberOf, ok } from "./shared";

export type ProductionRequirement = {
  productId: string;
  productName: string;
  demand: number;
  finishedGoodsAvailable: number;
  productionRequired: number;
};

export type MaterialRequirement = {
  materialId: string;
  materialName: string;
  unit: string;
  grossRequirement: number;
  safetyStock: number;
  available: number;
  confirmedIncoming: number;
  netShortage: number;
};

export type PlanResult = {
  orderIds: string[];
  orderCount: number;
  production: ProductionRequirement[];
  materials: MaterialRequirement[];
  ready: boolean;
};

export function calculateProductionRequirement(demand: number, available: number): number {
  return Math.max(0, demand - available);
}

export function calculateNetShortage(input: {
  grossRequirement: number;
  safetyStock: number;
  available: number;
  confirmedIncoming: number;
}): number {
  return Math.max(0, input.grossRequirement + input.safetyStock - input.available - input.confirmedIncoming);
}

export async function getInventoryPosition(
  db: DbClient,
  businessId: string,
  entityKind: "PRODUCT" | "MATERIAL",
  entityId: string,
): Promise<{ onHand: number; reserved: number; available: number }> {
  const [movements, reservations] = await Promise.all([
    db.inventoryMovement.aggregate({
      where: { businessId, entityKind, entityId },
      _sum: { quantity: true },
    }),
    db.inventoryReservation.aggregate({
      where: { businessId, entityKind, entityId, status: "ACTIVE" },
      _sum: { quantity: true },
    }),
  ]);
  const onHand = numberOf(movements._sum.quantity);
  const reserved = numberOf(reservations._sum.quantity);
  return { onHand, reserved, available: Math.max(0, onHand - reserved) };
}

export const getFinishedGoodsPosition = (db: PrismaClient, businessId: string, productId: string) =>
  getInventoryPosition(db, businessId, "PRODUCT", productId);

export const getMaterialPosition = (db: PrismaClient, businessId: string, materialId: string) =>
  getInventoryPosition(db, businessId, "MATERIAL", materialId);

export async function getBom(db: PrismaClient, businessId: string, productId: string) {
  return db.product.findFirstOrThrow({
    where: { id: productId, businessId },
    include: { bom: { include: { lines: { include: { material: true } } } } },
  });
}

export async function calculateMaterialRequirements(db: PrismaClient, businessId: string, productId: string, quantity: number) {
  const product = await getBom(db, businessId, productId);
  if (!product.bom?.active) throw new Error(`No active BOM for ${product.name}`);
  return product.bom.lines.map((line) => ({
    materialId: line.materialId,
    materialName: line.material.name,
    unit: line.material.unit,
    quantity: quantity * numberOf(line.quantityPerUnit),
  }));
}

export async function getOrdersDue(db: PrismaClient, businessId: string, dueAt: Date) {
  return db.customerOrder.findMany({
    where: { businessId, dueAt: { lte: dueAt }, status: { in: ["CONFIRMED", "ALLOCATED"] } },
    include: { lines: { include: { product: true } }, customer: true },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });
}

export async function planObjective(
  db: PrismaClient,
  input: { businessId: string; dueAt: Date; materialRequiredAt?: Date },
): Promise<ToolResult<PlanResult>> {
  const business = await db.business.findUniqueOrThrow({ where: { id: input.businessId } });
  const orders = await getOrdersDue(db, input.businessId, input.dueAt);
  const demandByProduct = new Map<string, { name: string; quantity: number }>();
  for (const order of orders) {
    for (const line of order.lines) {
      const current = demandByProduct.get(line.productId) ?? { name: line.product.name, quantity: 0 };
      current.quantity += numberOf(line.quantity) - numberOf(line.allocatedQuantity);
      demandByProduct.set(line.productId, current);
    }
  }

  const production: ProductionRequirement[] = [];
  const grossByMaterial = new Map<string, { name: string; unit: string; quantity: number; safetyStock: number }>();
  for (const [productId, demand] of demandByProduct) {
    const position = await getInventoryPosition(db, input.businessId, "PRODUCT", productId);
    const required = calculateProductionRequirement(demand.quantity, position.available);
    production.push({
      productId,
      productName: demand.name,
      demand: demand.quantity,
      finishedGoodsAvailable: position.available,
      productionRequired: required,
    });
    if (required === 0) continue;
    const product = await db.product.findFirstOrThrow({
      where: { id: productId, businessId: input.businessId },
      include: { bom: { include: { lines: { include: { material: true } } } } },
    });
    if (!product.bom?.active) throw new Error(`No active BOM for ${product.name}`);
    for (const line of product.bom.lines) {
      const current = grossByMaterial.get(line.materialId) ?? {
        name: line.material.name,
        unit: line.material.unit,
        quantity: 0,
        safetyStock: numberOf(line.material.safetyStock ?? business.defaultSafetyStock),
      };
      current.quantity += required * numberOf(line.quantityPerUnit);
      grossByMaterial.set(line.materialId, current);
    }
  }

  const materials: MaterialRequirement[] = [];
  const materialRequiredAt = input.materialRequiredAt ?? new Date(input.dueAt.getTime() - 3 * 86_400_000);
  for (const [materialId, gross] of grossByMaterial) {
    const position = await getInventoryPosition(db, input.businessId, "MATERIAL", materialId);
    const incoming = await db.purchaseOrderLine.aggregate({
      where: {
        materialId,
        purchaseOrder: {
          businessId: input.businessId,
          status: { in: ["ISSUED", "PARTIALLY_RECEIVED"] },
          expectedAt: { lte: materialRequiredAt },
        },
      },
      _sum: { quantity: true, receivedQuantity: true },
    });
    const confirmedIncoming = Math.max(0, numberOf(incoming._sum.quantity) - numberOf(incoming._sum.receivedQuantity));
    materials.push({
      materialId,
      materialName: gross.name,
      unit: gross.unit,
      grossRequirement: gross.quantity,
      safetyStock: gross.safetyStock,
      available: position.available,
      confirmedIncoming,
      netShortage: calculateNetShortage({
        grossRequirement: gross.quantity,
        safetyStock: gross.safetyStock,
        available: position.available,
        confirmedIncoming,
      }),
    });
  }

  const result: PlanResult = {
    orderIds: orders.map((order) => order.id),
    orderCount: orders.length,
    production,
    materials,
    ready: materials.every((material) => material.netShortage === 0),
  };
  return ok(result, [
    `${orders.length} orders checked`,
    `${production.reduce((sum, item) => sum + item.demand, 0)} finished units required`,
    `${materials.filter((item) => item.netShortage > 0).length} material shortages detected`,
  ]);
}
