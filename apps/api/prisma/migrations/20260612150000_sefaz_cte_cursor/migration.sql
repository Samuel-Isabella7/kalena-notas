-- Cursor separado para a distribuição de CT-e (serviço CTeDistribuicaoDFe tem NSU próprio).
ALTER TABLE "sefaz_cursors" ADD COLUMN IF NOT EXISTS "ult_nsu_cte" TEXT NOT NULL DEFAULT '0';
ALTER TABLE "sefaz_cursors" ADD COLUMN IF NOT EXISTS "max_nsu_cte" TEXT;
