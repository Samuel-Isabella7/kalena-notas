import { InvoiceKind, Role } from '@prisma/client';

/** Tipos de nota que um determinado papel pode visualizar. */
export function allowedKinds(role: Role): InvoiceKind[] {
  switch (role) {
    case Role.ADMIN_SERVICO:
      return [InvoiceKind.SERVICO];
    case Role.ADMIN_ICMS:
      return [InvoiceKind.ICMS];
    default:
      // CRIADOR, ADMIN e BALANCO veem os dois tipos
      return [InvoiceKind.SERVICO, InvoiceKind.ICMS];
  }
}

/** Criador e Administrador podem anexar/editar notas. Admin Serviço/ICMS são somente leitura. */
export function canWrite(role: Role): boolean {
  return role === Role.CRIADOR || role === Role.ADMIN;
}
