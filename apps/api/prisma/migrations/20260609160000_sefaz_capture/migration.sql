-- Cursor de NSU por CNPJ (captura incremental SEFAZ)
CREATE TABLE IF NOT EXISTS "sefaz_cursors" (
  "cnpj" TEXT NOT NULL,
  "ult_nsu" TEXT NOT NULL DEFAULT '0',
  "max_nsu" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sefaz_cursors_pkey" PRIMARY KEY ("cnpj")
);

-- NF-e capturadas da SEFAZ
CREATE TABLE IF NOT EXISTS "received_nfe" (
  "id" TEXT NOT NULL,
  "empresa_cnpj" TEXT NOT NULL,
  "empresa_nome" TEXT,
  "empresa_uf" TEXT,
  "chave" TEXT NOT NULL,
  "nsu" TEXT,
  "emitente_cnpj" TEXT,
  "emitente_nome" TEXT,
  "numero" TEXT,
  "serie" TEXT,
  "valor" DECIMAL(14,2),
  "data_emissao" DATE,
  "kind" "InvoiceKind" NOT NULL DEFAULT 'ICMS',
  "drive_file_id" TEXT,
  "drive_link" TEXT,
  "has_xml" BOOLEAN NOT NULL DEFAULT false,
  "resumo_only" BOOLEAN NOT NULL DEFAULT true,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "received_nfe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "received_nfe_chave_key" ON "received_nfe"("chave");
CREATE INDEX IF NOT EXISTS "received_nfe_data_emissao_idx" ON "received_nfe"("data_emissao");
CREATE INDEX IF NOT EXISTS "received_nfe_empresa_cnpj_idx" ON "received_nfe"("empresa_cnpj");
