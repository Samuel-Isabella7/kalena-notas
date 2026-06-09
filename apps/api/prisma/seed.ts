import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const nome = process.env.CRIADOR_NOME || 'Criador';
  const email = (process.env.CRIADOR_EMAIL || 'criador@kalena.com.br').toLowerCase();
  const senha = process.env.CRIADOR_SENHA || 'criador123';

  const passwordHash = await bcrypt.hash(senha, 10);

  await prisma.user.upsert({
    where: { email },
    update: { role: Role.CRIADOR, active: true },
    create: {
      name: nome,
      email,
      passwordHash,
      role: Role.CRIADOR,
    },
  });

  console.log(`Criador: ${email} (senha inicial: ${senha})`);
  console.log('Seed done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
