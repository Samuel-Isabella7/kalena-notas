-- Tipo do documento capturado (NFE, NFCE, CTE)
ALTER TABLE "received_nfe" ADD COLUMN IF NOT EXISTS "tipo_doc" TEXT NOT NULL DEFAULT 'NFE';
