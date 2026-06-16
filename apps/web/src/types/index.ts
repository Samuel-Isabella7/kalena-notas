export type Role = 'CRIADOR' | 'ADMIN' | 'ADMIN_SERVICO' | 'ADMIN_ICMS' | 'BALANCO';
export type OmieAccount = 'SP' | 'RJ';
export type InvoiceKind = 'SERVICO' | 'ICMS';
export type InvoiceStatus = 'PENDENTE' | 'MANUAL' | 'LANCADA' | 'ERRO';

export const ROLE_LABELS: Record<Role, string> = {
  CRIADOR: 'Criador',
  ADMIN: 'Administrador',
  ADMIN_SERVICO: 'Serviço',
  ADMIN_ICMS: 'ICMS',
  BALANCO: 'Balanço',
};

export const KIND_LABELS: Record<InvoiceKind, string> = {
  SERVICO: 'Serviço',
  ICMS: 'ICMS',
};

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDENTE: 'Pendente',
  MANUAL: 'Lançado Manual',
  LANCADA: 'Lançado via integração',
  ERRO: 'Erro no lançamento',
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Member extends AuthUser {
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  competenceDate: string; // YYYY-MM-DD
  account: OmieAccount;
  kind: InvoiceKind;
  status: InvoiceStatus;
  fileName: string;
  mimeType: string;
  fileSize: number;
  driveLink: string | null;
  hasLocalFile: boolean;
  fornecedorNome: string | null;
  fornecedorDoc: string | null;
  numeroDocumento: string | null;
  valor: number | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  categoriaCodigo: string | null;
  categoriaDescricao: string | null;
  contaCorrenteId: string | null;
  contaCorrenteDescricao: string | null;
  observacao: string | null;
  omieCodigoLancamento: string | null;
  omieErro: string | null;
  launchedAt: string | null;
  uploadedByName: string | null;
  launchedByName: string | null;
  createdAt: string;
}

export interface UploadResult {
  invoice: Invoice;
  extraction: { textOk: boolean; source?: 'ai' | 'regex' | 'none' };
}

export interface ReceivedMeta {
  total: number;
  manifestaveis: number;
  ufs: { uf: string; qtd: number }[];
  tipos: { tipo: string; qtd: number }[];
  emitentes: string[];
  meses: string[];
}

export interface PhysicalNote {
  id: string;
  nome: string;
  observacao: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  driveLink: string | null;
  hasFile: boolean;
  uploadedById: string;
  uploadedByName: string | null;
  createdAt: string;
}

export interface PhysicalNoteMeta {
  total: number;
  meses: string[];
}

export interface DashboardSummary {
  periodoMes: string;
  totais: {
    totalNotas: number;
    recebidas: number;
    anexadas: number;
    fisicas: number;
    pendentes: number;
    processadasHoje: number;
    anexadasMes: number;
    valorMes: number;
  };
  porTipo: { tipo: string; qtd: number }[];
  invoicesPorStatus: { status: string; qtd: number }[];
  situacao: { label: string; value: number }[];
  atividades: {
    id: string;
    action: string;
    entity: string | null;
    details: any;
    quem: string;
    createdAt: string;
  }[];
  ultimasRecebidas: {
    id: string;
    tipoDoc: string;
    emitenteNome: string | null;
    emitenteCnpj: string | null;
    numero: string | null;
    valor: number | null;
    dataEmissao: string | null;
    hasXml: boolean;
    capturedAt: string;
  }[];
  integracoes: { sefaz: boolean; omie: boolean; drive: boolean; ia: boolean };
}

export interface MonthSummary {
  month: number;
  name: string;
  businessDays: number;
  total: number;
  lancadas: number;
  manuais: number;
  pendentes: number;
  erros: number;
}

export interface CalendarOverview {
  year: number;
  months: MonthSummary[];
}

export interface CalendarDay {
  date: string;
  day: number;
  weekday: number;
  isWeekend: boolean;
  isBusinessDay: boolean;
  holiday: string | null;
  total: number;
  lancadas: number;
  manuais: number;
  pendentes: number;
  erros: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  name: string;
  days: CalendarDay[];
}

export interface OmieOption {
  codigo: string;
  descricao: string;
}

export interface ReceivedNfe {
  id: string;
  empresaNome: string | null;
  empresaCnpj: string;
  empresaUf: string | null;
  chave: string;
  tipoDoc: 'NFE' | 'NFCE' | 'CTE' | string;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  numero: string | null;
  serie: string | null;
  valor: number | null;
  dataEmissao: string | null;
  kind: InvoiceKind;
  driveLink: string | null;
  hasXml: boolean;
  capturedAt: string;
}
