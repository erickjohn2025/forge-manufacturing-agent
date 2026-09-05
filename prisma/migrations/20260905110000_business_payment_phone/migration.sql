ALTER TABLE "Business" ADD COLUMN "manufacturerPaymentPhone" TEXT;

UPDATE "Business"
SET "manufacturerPaymentPhone" = '0768967257'
WHERE "slug" = 'kilimanjaro-foods';
