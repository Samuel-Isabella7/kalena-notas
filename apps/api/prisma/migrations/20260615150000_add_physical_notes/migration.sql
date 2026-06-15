-- Notas físicas (documentos em papel anexados manualmente).
CREATE TABLE IF NOT EXISTS "physical_notes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "observacao" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "drive_file_id" TEXT,
    "drive_link" TEXT,
    "local_path" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "physical_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "physical_notes_created_at_idx" ON "physical_notes"("created_at");

ALTER TABLE "physical_notes"
    ADD CONSTRAINT "physical_notes_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
