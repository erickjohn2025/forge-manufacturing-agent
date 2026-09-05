import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const db = new PrismaClient();

function nextWeekday(day: number, hour = 12): Date {
  const now = new Date();
  const delta = (day - now.getUTCDay() + 7) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + delta, hour));
}

async function main() {
  const existingBusinesses = await db.business.findMany({ where: { slug: { in: ["kilimanjaro-foods", "zanzibar-cosmetics"] } }, select: { id: true } });
  for (const { id: businessId } of existingBusinesses) {
    await db.$transaction(async (tx) => {
      await tx.objectiveStep.deleteMany({ where: { objective: { businessId } } });
      await tx.approvalRequest.deleteMany({ where: { businessId } });
      await tx.goodsReceiptLine.deleteMany({ where: { goodsReceipt: { businessId } } });
      await tx.goodsReceipt.deleteMany({ where: { businessId } });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { businessId } } });
      await tx.purchaseOrder.deleteMany({ where: { businessId } });
      await tx.supplierQuote.deleteMany({ where: { businessId } });
      await tx.rfqRecipient.deleteMany({ where: { rfq: { businessId } } });
      await tx.rfq.deleteMany({ where: { businessId } });
      await tx.productionMaterialAllocation.deleteMany({ where: { job: { businessId } } });
      await tx.productionJob.deleteMany({ where: { businessId } });
      await tx.inventoryReservation.deleteMany({ where: { businessId } });
      await tx.inventoryMovement.deleteMany({ where: { businessId } });
      await tx.customerOrderLine.deleteMany({ where: { order: { businessId } } });
      await tx.customerOrder.deleteMany({ where: { businessId } });
      await tx.bomLine.deleteMany({ where: { material: { businessId } } });
      await tx.bom.deleteMany({ where: { product: { businessId } } });
      await tx.supplierMaterial.deleteMany({ where: { supplier: { businessId } } });
      await tx.agentActionEvent.deleteMany({ where: { businessId } });
      await tx.externalMessage.deleteMany({ where: { businessId } });
      await tx.objective.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
    });
  }
  await db.user.deleteMany({ where: { email: { in: ["admin@demo.co.tz", "operator@demo.co.tz", "approver@demo.co.tz"] } } });

  const passwordHash = await argon2.hash("Demo123!");
  const [admin, operator, approver] = await Promise.all([
    db.user.create({ data: { email: "admin@demo.co.tz", name: "Demo Admin", phone: process.env.DEMO_ADMIN_PHONE ?? "+255700000020", passwordHash } }),
    db.user.create({ data: { email: "operator@demo.co.tz", name: "Demo Operator", phone: process.env.DEMO_OPERATOR_PHONE ?? "+255700000021", passwordHash } }),
    db.user.create({ data: { email: "approver@demo.co.tz", name: "Demo Approver", phone: process.env.DEMO_APPROVER_PHONE ?? "+255700000022", passwordHash } }),
  ]);
  const friday = nextWeekday(5);
  const tuesday = new Date(friday.getTime() - 3 * 86_400_000);
  const monday = new Date(friday.getTime() - 4 * 86_400_000);

  const hero = await db.business.create({
    data: {
      name: "Kilimanjaro Foods Ltd", slug: "kilimanjaro-foods", currency: "TZS", timezone: "Africa/Dar_es_Salaam",
      autoPurchaseLimit: 250_000, defaultSafetyStock: 0, inboundNumber: process.env.AFRICASTALKING_INBOUND_NUMBER || "+255700000000",
      memberships: { create: [{ userId: admin.id, role: "ADMIN" }, { userId: operator.id, role: "OPERATOR" }, { userId: approver.id, role: "APPROVER" }] },
      sequences: { create: [{ key: "RFQ", nextValue: 104 }, { key: "PO", nextValue: 204 }, { key: "PJ", nextValue: 301 }] },
      customers: { create: [{ id: "hero-customer", code: "CUST-001", name: "Dar Distributors", phone: "+255700000010" }] },
      products: { create: [{ id: "hero-product-a", sku: "PROD-A", name: "Product A", unit: "unit" }] },
      materials: { create: [
        { id: "hero-ingredient-a", sku: "ING-A", name: "Ingredient A", unit: "kg", safetyStock: 0 },
        { id: "hero-packaging", sku: "PACK", name: "Packaging", unit: "unit", safetyStock: 200, specification: "Food-grade pouch" },
        { id: "hero-labels", sku: "LABEL", name: "Labels", unit: "unit", safetyStock: 0 },
      ] },
      suppliers: { create: [
        { id: "hero-supplier-a", code: "SUP-A", name: "Supplier A", phone: process.env.DEMO_SUPPLIER_A_PHONE ?? "+255700000001", approved: true, reliability: 96, quality: 94, preferred: true },
        { id: "hero-supplier-b", code: "SUP-B", name: "Supplier B", phone: process.env.DEMO_SUPPLIER_B_PHONE ?? "+255700000002", approved: true, reliability: 89, quality: 91 },
      ] },
    },
  });

  await db.bom.create({ data: { productId: "hero-product-a", lines: { create: [
    { materialId: "hero-ingredient-a", quantityPerUnit: 0.1 },
    { materialId: "hero-packaging", quantityPerUnit: 1 },
    { materialId: "hero-labels", quantityPerUnit: 1 },
  ] } } });
  await db.supplierMaterial.createMany({ data: [
    { supplierId: "hero-supplier-a", materialId: "hero-packaging", minimumOrder: 500, normalLeadDays: 2, specification: "Food-grade pouch" },
    { supplierId: "hero-supplier-b", materialId: "hero-packaging", minimumOrder: 500, normalLeadDays: 5, specification: "Food-grade pouch" },
  ] });
  await db.customerOrder.createMany({ data: [
    { id: "hero-order-101", businessId: hero.id, customerId: "hero-customer", code: "ORD-101", dueAt: friday },
    { id: "hero-order-102", businessId: hero.id, customerId: "hero-customer", code: "ORD-102", dueAt: friday },
    { id: "hero-order-103", businessId: hero.id, customerId: "hero-customer", code: "ORD-103", dueAt: friday },
  ] });
  await db.customerOrderLine.createMany({ data: [
    { orderId: "hero-order-101", productId: "hero-product-a", quantity: 2_000 },
    { orderId: "hero-order-102", productId: "hero-product-a", quantity: 1_500 },
    { orderId: "hero-order-103", productId: "hero-product-a", quantity: 1_500 },
  ] });
  await db.inventoryMovement.createMany({ data: [
    { businessId: hero.id, entityKind: "PRODUCT", entityId: "hero-product-a", type: "ADJUSTMENT", quantity: 1_000, referenceType: "SEED", idempotencyKey: "seed:fg" },
    { businessId: hero.id, entityKind: "MATERIAL", entityId: "hero-ingredient-a", type: "ADJUSTMENT", quantity: 400, referenceType: "SEED", idempotencyKey: "seed:ingredient" },
    { businessId: hero.id, entityKind: "MATERIAL", entityId: "hero-packaging", type: "ADJUSTMENT", quantity: 2_400, referenceType: "SEED", idempotencyKey: "seed:packaging" },
    { businessId: hero.id, entityKind: "MATERIAL", entityId: "hero-labels", type: "ADJUSTMENT", quantity: 4_000, referenceType: "SEED", idempotencyKey: "seed:labels" },
  ] });
  await db.purchaseOrder.create({ data: {
    businessId: hero.id, supplierId: "hero-supplier-a", code: "PO-203", currency: "TZS", total: 220_000,
    expectedAt: monday, status: "ISSUED", idempotencyKey: "seed:incoming-po",
    lines: { create: { materialId: "hero-packaging", quantity: 400, unitPrice: 550 } },
  } });

  const second = await db.business.create({ data: {
    name: "Zanzibar Cosmetics", slug: "zanzibar-cosmetics", currency: "TZS", timezone: "Africa/Dar_es_Salaam", autoPurchaseLimit: 500_000, defaultSafetyStock: 25,
    memberships: { create: [{ userId: admin.id, role: "ADMIN" }] },
    customers: { create: { id: "second-customer", code: "CUST-001", name: "Island Retail" } },
    products: { create: [
      { id: "second-lotion", sku: "LOT-100", name: "Body Lotion", unit: "bottle" },
      { id: "second-oil", sku: "OIL-100", name: "Body Oil", unit: "bottle" },
    ] },
    materials: { create: [
      { id: "second-bottle", sku: "BOTTLE", name: "Shared Bottle", unit: "bottle", safetyStock: 50 },
      { id: "second-lotion-base", sku: "BASE-L", name: "Lotion Base", unit: "kg", safetyStock: 5 },
      { id: "second-oil-base", sku: "BASE-O", name: "Oil Base", unit: "litre", safetyStock: 5 },
    ] },
  } });
  await db.bom.createMany({ data: [{ id: "second-bom-lotion", productId: "second-lotion" }, { id: "second-bom-oil", productId: "second-oil" }] });
  await db.bomLine.createMany({ data: [
    { bomId: "second-bom-lotion", materialId: "second-bottle", quantityPerUnit: 1 },
    { bomId: "second-bom-lotion", materialId: "second-lotion-base", quantityPerUnit: 0.2 },
    { bomId: "second-bom-oil", materialId: "second-bottle", quantityPerUnit: 1 },
    { bomId: "second-bom-oil", materialId: "second-oil-base", quantityPerUnit: 0.1 },
  ] });
  await db.customerOrder.create({ data: { id: "second-order", businessId: second.id, customerId: "second-customer", code: "ORD-Z-01", dueAt: friday, lines: { create: [{ productId: "second-lotion", quantity: 100 }, { productId: "second-oil", quantity: 150 }] } } });
  await db.inventoryMovement.createMany({ data: [
    { businessId: second.id, entityKind: "MATERIAL", entityId: "second-bottle", type: "ADJUSTMENT", quantity: 100, idempotencyKey: "seed:bottle" },
    { businessId: second.id, entityKind: "MATERIAL", entityId: "second-lotion-base", type: "ADJUSTMENT", quantity: 30, idempotencyKey: "seed:lotion-base" },
    { businessId: second.id, entityKind: "MATERIAL", entityId: "second-oil-base", type: "ADJUSTMENT", quantity: 20, idempotencyKey: "seed:oil-base" },
  ] });

  console.log(`Seeded ${hero.name} and ${second.name}. Demo password: Demo123!`);
}

main().finally(() => db.$disconnect());
