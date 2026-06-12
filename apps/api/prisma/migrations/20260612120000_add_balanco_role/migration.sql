-- Novo perfil "Balanço": visualiza notas de Serviço, ICMS e Recebidas (SEFAZ), somente leitura.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'BALANCO';
