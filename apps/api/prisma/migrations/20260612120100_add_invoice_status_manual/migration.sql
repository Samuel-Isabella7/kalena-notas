-- Novo status "Lançado Manual" (nota lançada manualmente na Omie, fora da integração).
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'MANUAL';
