-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('Draft', 'Issued', 'Paid', 'Void');

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount_usd" DOUBLE PRECISION NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Draft',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_status_created_at_idx" ON "invoices"("status", "created_at");
