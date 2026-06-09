-- Novos papéis de administrador com escopo por tipo de nota
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN_SERVICO';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMIN_ICMS';

-- Tipo da nota: Serviço x ICMS
DO $$ BEGIN
  CREATE TYPE "InvoiceKind" AS ENUM ('SERVICO', 'ICMS');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "kind" "InvoiceKind" NOT NULL DEFAULT 'SERVICO';
