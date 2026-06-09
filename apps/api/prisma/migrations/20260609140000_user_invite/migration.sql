-- Convite de membros por e-mail (a pessoa define nome e senha pelo link)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_exp" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_invite_token_key" ON "users"("invite_token");
