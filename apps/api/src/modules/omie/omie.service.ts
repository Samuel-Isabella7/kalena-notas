import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { OmieAccount } from '@prisma/client';

interface OmieCredential {
  account: OmieAccount;
  appKey: string;
  appSecret: string;
}

export interface OmieOption {
  codigo: string;
  descricao: string;
}

export interface ContaPagarInput {
  fornecedorDoc: string;
  fornecedorNome: string;
  numeroDocumento?: string | null;
  valor: number;
  dataEmissao?: string | null; // YYYY-MM-DD
  dataVencimento: string; // YYYY-MM-DD
  categoriaCodigo: string;
  contaCorrenteId: string;
  observacao?: string | null;
  integrationCode: string; // chave de integração única (id da nota)
}

export interface ContaPagarResult {
  codigoLancamento: string;
  integrationCode: string;
}

@Injectable()
export class OmieService {
  private readonly logger = new Logger(OmieService.name);
  private readonly http: AxiosInstance;
  private readonly baseURL: string;
  private categoriaCache = new Map<OmieAccount, OmieOption[]>();
  private contaCorrenteCache = new Map<OmieAccount, OmieOption[]>();

  constructor(private config: ConfigService) {
    this.baseURL = config.get<string>('OMIE_BASE_URL', 'https://app.omie.com.br/api/v1');
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Quais contas (SP/RJ) estão configuradas. */
  configuredAccounts(): OmieAccount[] {
    const out: OmieAccount[] = [];
    if (this.config.get<string>('OMIE_SP_APP_KEY') && this.config.get<string>('OMIE_SP_APP_SECRET')) {
      out.push(OmieAccount.SP);
    }
    if (this.config.get<string>('OMIE_RJ_APP_KEY') && this.config.get<string>('OMIE_RJ_APP_SECRET')) {
      out.push(OmieAccount.RJ);
    }
    return out;
  }

  private getCredential(account: OmieAccount): OmieCredential {
    const key = this.config.get<string>(`OMIE_${account}_APP_KEY`, '');
    const secret = this.config.get<string>(`OMIE_${account}_APP_SECRET`, '');
    if (!key || !secret) {
      throw new BadRequestException(
        `Credenciais da Omie para a conta ${account} não estão configuradas no servidor.`,
      );
    }
    return { account, appKey: key, appSecret: secret };
  }

  private async call<T = any>(
    endpoint: string,
    callName: string,
    cred: OmieCredential,
    params: any[] = [{}],
    attempt = 1,
  ): Promise<T> {
    try {
      const res = await this.http.post(endpoint, {
        call: callName,
        app_key: cred.appKey,
        app_secret: cred.appSecret,
        param: params,
      });
      return res.data as T;
    } catch (e: any) {
      const status = e.response?.status;
      const body = e.response?.data;
      const omieMsg =
        body?.faultstring ||
        body?.faultcode ||
        (body ? JSON.stringify(body).slice(0, 600) : null) ||
        e.message;

      const isTransient =
        /Broken response/i.test(omieMsg) ||
        /timeout/i.test(omieMsg) ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (isTransient && attempt < 3) {
        const wait = attempt * 2000;
        this.logger.warn(
          `[Omie ${cred.account}] Erro transitório em "${callName}" (tentativa ${attempt}). Aguardando ${wait}ms...`,
        );
        await new Promise((r) => setTimeout(r, wait));
        return this.call<T>(endpoint, callName, cred, params, attempt + 1);
      }

      this.logger.error(`[Omie ${cred.account}] HTTP ${status} em "${callName}" -> ${omieMsg}`);
      throw new BadRequestException(`Omie (${cred.account}): ${omieMsg}`);
    }
  }

  /** Decodifica entidades HTML que a Omie às vezes retorna (&lt; &gt; &amp; etc.). */
  private decode(s: string): string {
    return s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .trim();
  }

  // ---------- Categorias ----------
  async listCategorias(account: OmieAccount): Promise<OmieOption[]> {
    if (this.categoriaCache.has(account)) return this.categoriaCache.get(account)!;
    const cred = this.getCredential(account);

    const all: any[] = [];
    let pagina = 1;
    let totalPaginas = 1;
    do {
      const data = await this.call<any>('/geral/categorias/', 'ListarCategorias', cred, [
        { pagina, registros_por_pagina: 50 },
      ]);
      totalPaginas = Number(data?.total_de_paginas || 1);
      for (const c of data?.categoria_cadastro || []) all.push(c);
      pagina++;
    } while (pagina <= totalPaginas && pagina <= 50);

    const options = all
      // exclui apenas inativas, totalizadoras (agrupadoras) e ocultas
      .filter(
        (c) =>
          c.codigo &&
          c.conta_inativa !== 'S' &&
          c.totalizadora !== 'S' &&
          c.nao_exibir !== 'S',
      )
      .map((c) => ({
        codigo: String(c.codigo),
        descricao: this.decode(String(c.descricao ?? c.codigo)),
      }))
      .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

    this.categoriaCache.set(account, options);
    return options;
  }

  // ---------- Contas correntes ----------
  async listContasCorrentes(account: OmieAccount): Promise<OmieOption[]> {
    if (this.contaCorrenteCache.has(account)) return this.contaCorrenteCache.get(account)!;
    const cred = this.getCredential(account);

    const all: any[] = [];
    let pagina = 1;
    let totalPaginas = 1;
    do {
      const data = await this.call<any>('/geral/contacorrente/', 'ListarContasCorrentes', cred, [
        { pagina, registros_por_pagina: 50, apenas_importado_api: 'N' },
      ]);
      totalPaginas = Number(data?.total_de_paginas || 1);
      const arr: any[] = data?.ListarContasCorrentes || data?.conta_corrente_cadastro || [];
      for (const c of arr) all.push(c);
      pagina++;
    } while (pagina <= totalPaginas && pagina <= 50);

    const options = all
      .filter((c) => (c.nCodCC ?? c.codigo) && c.inativo !== 'S')
      .map((c) => ({
        codigo: String(c.nCodCC ?? c.codigo),
        descricao: this.decode(String(c.descricao ?? c.cDesc ?? c.nCodCC ?? c.codigo)),
      }))
      .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));

    this.contaCorrenteCache.set(account, options);
    return options;
  }

  clearCache(account?: OmieAccount) {
    if (account) {
      this.categoriaCache.delete(account);
      this.contaCorrenteCache.delete(account);
    } else {
      this.categoriaCache.clear();
      this.contaCorrenteCache.clear();
    }
  }

  // ---------- Fornecedor ----------
  private async findOrCreateFornecedor(
    cred: OmieCredential,
    doc: string,
    nome: string,
  ): Promise<number> {
    const cnpj = doc.replace(/\D/g, '');
    // Tenta consultar pelo documento
    try {
      const found = await this.call<any>('/geral/clientes/', 'ConsultarCliente', cred, [
        { cnpj_cpf: cnpj },
      ]);
      if (found?.codigo_cliente_omie) return Number(found.codigo_cliente_omie);
    } catch {
      // não encontrado -> cria
    }

    const created = await this.call<any>('/geral/clientes/', 'IncluirCliente', cred, [
      {
        codigo_cliente_integracao: `KNF-${cnpj}`,
        razao_social: nome || `Fornecedor ${cnpj}`,
        cnpj_cpf: cnpj,
        cliente_fornecedor: 'F',
      },
    ]);
    if (!created?.codigo_cliente_omie) {
      throw new BadRequestException('Não foi possível obter/criar o fornecedor na Omie.');
    }
    return Number(created.codigo_cliente_omie);
  }

  // ---------- Lançar Conta a Pagar ----------
  async incluirContaPagar(account: OmieAccount, input: ContaPagarInput): Promise<ContaPagarResult> {
    const cred = this.getCredential(account);

    if (!input.valor || input.valor <= 0) throw new BadRequestException('Valor inválido.');
    if (!input.dataVencimento) throw new BadRequestException('Data de vencimento obrigatória.');
    if (!input.categoriaCodigo) throw new BadRequestException('Categoria obrigatória.');
    if (!input.contaCorrenteId) throw new BadRequestException('Conta corrente obrigatória.');
    if (!input.fornecedorDoc) throw new BadRequestException('CNPJ/CPF do fornecedor obrigatório.');

    const fornecedorId = await this.findOrCreateFornecedor(
      cred,
      input.fornecedorDoc,
      input.fornecedorNome,
    );

    const param: any = {
      codigo_lancamento_integracao: input.integrationCode,
      codigo_cliente_fornecedor: fornecedorId,
      data_vencimento: this.toBrDate(input.dataVencimento),
      valor_documento: input.valor,
      codigo_categoria: input.categoriaCodigo,
      id_conta_corrente: Number(input.contaCorrenteId),
    };
    if (input.numeroDocumento) param.numero_documento = input.numeroDocumento;
    if (input.dataEmissao) param.data_emissao = this.toBrDate(input.dataEmissao);
    if (input.observacao) param.observacao = input.observacao;

    const res = await this.call<any>('/financas/contapagar/', 'IncluirContaPagar', cred, [param]);

    const codigo =
      res?.codigo_lancamento_omie ?? res?.codigo_lancamento_integracao ?? input.integrationCode;
    return { codigoLancamento: String(codigo), integrationCode: input.integrationCode };
  }

  private toBrDate(iso: string): string {
    const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) throw new BadRequestException(`Data inválida: ${iso}`);
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
