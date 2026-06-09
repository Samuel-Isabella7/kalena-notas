-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CRIADOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "OmieAccount" AS ENUM ('SP', 'RJ');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDENTE', 'LANCADA', 'ERRO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "competence_date" DATE NOT NULL,
    "account" "OmieAccount" NOT NULL DEFAULT 'SP',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDENTE',
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "drive_file_id" TEXT,
    "drive_link" TEXT,
    "local_path" TEXT,
    "fornecedor_nome" TEXT,
    "fornecedor_doc" TEXT,
    "numero_documento" TEXT,
    "valor" DECIMAL(14,2),
    "data_emissao" DATE,
    "data_vencimento" DATE,
    "categoria_codigo" TEXT,
    "categoria_descricao" TEXT,
    "conta_corrente_id" TEXT,
    "conta_corrente_descricao" TEXT,
    "observacao" TEXT,
    "extracted_raw" JSONB,
    "omie_codigo_lancamento" TEXT,
    "omie_integration_code" TEXT,
    "omie_erro" TEXT,
    "launched_at" TIMESTAMP(3),
    "uploaded_by_id" TEXT NOT NULL,
    "launched_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "invoices_competence_date_idx" ON "invoices"("competence_date");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_launched_by_id_fkey" FOREIGN KEY ("launched_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
