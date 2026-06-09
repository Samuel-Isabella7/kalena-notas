import { InvoiceKind, Role } from '@prisma/client';

/** Tipos de nota que um determinado papel pode visualizar. */
export function allowedKinds(role: Role): InvoiceKind[] {
  switch (role) {
    case Role.ADMIN_SERVICO:
      return [InvoiceKind.SERVICO];
    case Role.ADMIN_ICMS:
      return [InvoiceKind.ICMS];
    default:
      // CRIADOR e ADMIN veem os dois tipos
      return [InvoiceKind.SERVICO, InvoiceKind.ICMS];
  }
}

/** Apenas o criador pode anexar/editar/lançar notas. Todos os administradores são somente leitura. */
export function canWrite(role: Role): boolean {
  return role === Role.CRIADOR;
}
