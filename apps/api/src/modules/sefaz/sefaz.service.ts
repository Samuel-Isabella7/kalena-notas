import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { XMLParser } from 'fast-xml-parser';
import { InvoiceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveService } from '../storage/drive.service';
import { DanfeService } from './danfe.service';

interface SefazCompany {
  key: string;
  nome: string;
  cnpj: string; // só dígitos
  uf: string;
  pfx: Buffer;
  senha: string;
}

interface CertPem {
  keyPem: string;
  certPem: string;
}

interface DistResult {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  docs: Array<{ nsu: string; schema: string; xml: string }>;
}

// Código IBGE da UF (cUFAutor)
const UF_IBGE: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53',
};

const ENDPOINTS = {
  // Ambiente Nacional (AN)
  '1': 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  '2': 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
};

// Distribuição de CT-e (fretes) — serviço separado do de NF-e, com NSU próprio.
// A URL pode ser sobreposta por env (SEFAZ_CTE_DIST_URL).
const CTE_ENDPOINTS = {
  '1': 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
  '2': 'https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
};

// NFeRecepcaoEvento 4.00 — Manifestação do Destinatário (Ambiente Nacional).
// A URL pode ser sobreposta por env (SEFAZ_RECEPCAO_EVENTO_URL) caso a SEFAZ a altere.
const RECEPCAO_EVENTO_ENDPOINTS = {
  '1': 'https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  '2': 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
};

// Ciência da Operação (manifestação do destinatário)
const TP_EVENTO_CIENCIA = '210210';

@Injectable()
export class SefazService {
  private readonly logger = new Logger(SefazService.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
  });

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private drive: DriveService,
    private danfe: DanfeService,
  ) {}

  private tpAmb(): string {
    return this.config.get<string>('SEFAZ_AMBIENTE', '1') === '2' ? '2' : '1';
  }

  /** Lê as empresas configuradas via env (SEFAZ_<KEY>_*). */
  companies(): SefazCompany[] {
    const keys = ['SP', 'RJ', 'AL'];
    const out: SefazCompany[] = [];
    for (const key of keys) {
      const cnpj = (this.config.get<string>(`SEFAZ_${key}_CNPJ`, '') || '').replace(/\D/g, '');
      let base64 = (this.config.get<string>(`SEFAZ_${key}_CERT_BASE64`, '') || '').trim();
      // Alternativa: caminho de um Secret File contendo o base64 do .pfx
      if (!base64) {
        const file = (this.config.get<string>(`SEFAZ_${key}_CERT_FILE`, '') || '').trim();
        if (file && fs.existsSync(file)) {
          base64 = fs.readFileSync(file, 'utf8').replace(/\s+/g, '');
        }
      }
      const senha = this.config.get<string>(`SEFAZ_${key}_SENHA`, '') || '';
      const uf = (this.config.get<string>(`SEFAZ_${key}_UF`, key) || key).toUpperCase();
      const nome = this.config.get<string>(`SEFAZ_${key}_NOME`, key) || key;
      if (cnpj && base64 && senha) {
        out.push({ key, nome, cnpj, uf, pfx: Buffer.from(base64, 'base64'), senha });
      }
    }
    return out;
  }

  status() {
    return {
      ambiente: this.tpAmb() === '1' ? 'producao' : 'homologacao',
      empresas: this.companies().map((c) => ({
        key: c.key,
        nome: c.nome,
        cnpj: c.cnpj,
        uf: c.uf,
      })),
    };
  }

  private pad15(nsu: string): string {
    return String(nsu || '0').replace(/\D/g, '').padStart(15, '0');
  }

  private buildSoap(company: SefazCompany, ultNsu: string): string {
    const cUF = UF_IBGE[company.uf] || '35';
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
      '<soap12:Body>' +
      '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">' +
      '<nfeDadosMsg>' +
      '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">' +
      `<tpAmb>${this.tpAmb()}</tpAmb>` +
      `<cUFAutor>${cUF}</cUFAutor>` +
      `<CNPJ>${company.cnpj}</CNPJ>` +
      `<distNSU><ultNSU>${this.pad15(ultNsu)}</ultNSU></distNSU>` +
      '</distDFeInt>' +
      '</nfeDadosMsg>' +
      '</nfeDistDFeInteresse>' +
      '</soap12:Body>' +
      '</soap12:Envelope>'
    );
  }

  /** Converte o retDistDFeInt (NF-e ou CT-e) no resultado padronizado. */
  private mapDistResult(ret: any, fallbackNsu: string): DistResult {
    const lote = ret.loteDistDFeInt?.docZip;
    const arr = lote ? (Array.isArray(lote) ? lote : [lote]) : [];
    const docs = arr.map((d: any) => ({
      nsu: String(d['@_NSU'] || ''),
      schema: String(d['@_schema'] || ''),
      xml: this.gunzip(String(d['#text'] || d || '')),
    }));

    return {
      cStat: String(ret.cStat || ''),
      xMotivo: String(ret.xMotivo || ''),
      ultNSU: String(ret.ultNSU || fallbackNsu),
      maxNSU: String(ret.maxNSU || fallbackNsu),
      docs,
    };
  }

  /** Uma chamada ao NFeDistribuicaoDFe a partir do ultNSU. */
  private async callDistribuicao(company: SefazCompany, ultNsu: string): Promise<DistResult> {
    const agent = new https.Agent({ pfx: company.pfx, passphrase: company.senha });
    const url = ENDPOINTS[this.tpAmb() as '1' | '2'];

    let res;
    try {
      res = await axios.post(url, this.buildSoap(company, ultNsu), {
        httpsAgent: agent,
        timeout: 60_000,
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      });
    } catch (e: any) {
      const msg = e?.response?.data
        ? String(e.response.data).slice(0, 300)
        : e.message;
      throw new BadRequestException(`SEFAZ (${company.nome}): falha na chamada — ${msg}`);
    }

    const parsed = this.parser.parse(res.data);
    const ret =
      parsed?.Envelope?.Body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt;
    if (!ret) {
      throw new BadRequestException(`SEFAZ (${company.nome}): resposta inesperada.`);
    }
    return this.mapDistResult(ret, ultNsu);
  }

  private buildSoapCte(company: SefazCompany, ultNsu: string): string {
    const cUF = UF_IBGE[company.uf] || '35';
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
      '<soap12:Body>' +
      '<cteDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe">' +
      '<cteDadosMsg>' +
      '<distDFeInt xmlns="http://www.portalfiscal.inf.br/cte" versao="1.00">' +
      `<tpAmb>${this.tpAmb()}</tpAmb>` +
      `<cUFAutor>${cUF}</cUFAutor>` +
      `<CNPJ>${company.cnpj}</CNPJ>` +
      `<distNSU><ultNSU>${this.pad15(ultNsu)}</ultNSU></distNSU>` +
      '</distDFeInt>' +
      '</cteDadosMsg>' +
      '</cteDistDFeInteresse>' +
      '</soap12:Body>' +
      '</soap12:Envelope>'
    );
  }

  /** Uma chamada ao CTeDistribuicaoDFe a partir do ultNSU (cursor separado do de NF-e). */
  private async callDistribuicaoCte(company: SefazCompany, ultNsu: string): Promise<DistResult> {
    const agent = new https.Agent({ pfx: company.pfx, passphrase: company.senha });
    const override = (this.config.get<string>('SEFAZ_CTE_DIST_URL', '') || '').trim();
    const url = override || CTE_ENDPOINTS[this.tpAmb() as '1' | '2'];

    let res;
    try {
      res = await axios.post(url, this.buildSoapCte(company, ultNsu), {
        httpsAgent: agent,
        timeout: 60_000,
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      });
    } catch (e: any) {
      const msg = e?.response?.data
        ? String(e.response.data).slice(0, 300)
        : e.message;
      throw new BadRequestException(`SEFAZ CT-e (${company.nome}): falha na chamada — ${msg}`);
    }

    const parsed = this.parser.parse(res.data);
    const ret =
      parsed?.Envelope?.Body?.cteDistDFeInteresseResponse?.cteDistDFeInteresseResult?.retDistDFeInt;
    if (!ret) {
      throw new BadRequestException(`SEFAZ CT-e (${company.nome}): resposta inesperada.`);
    }
    return this.mapDistResult(ret, ultNsu);
  }

  private gunzip(b64: string): string {
    try {
      return zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
    } catch {
      return '';
    }
  }

  /** Sincroniza todas as empresas configuradas. reset=true reprocessa do NSU 0. */
  async sync(reset = false) {
    const companies = this.companies();
    if (companies.length === 0) {
      throw new BadRequestException(
        'Nenhuma empresa configurada para a SEFAZ. Configure os certificados no servidor.',
      );
    }

    const resumo: any[] = [];
    for (const company of companies) {
      const item: any = { empresa: company.nome };

      // NF-e
      try {
        if (reset) {
          await this.prisma.sefazCursor.upsert({
            where: { cnpj: company.cnpj },
            update: { ultNsu: '0', ultNsuCte: '0' },
            create: { cnpj: company.cnpj, ultNsu: '0', ultNsuCte: '0' },
          });
        }
        Object.assign(item, await this.syncCompany(company));
      } catch (e: any) {
        this.logger.error(`Sync NF-e ${company.nome}: ${e.message}`);
        item.erro = e.message;
      }

      // CT-e (serviço separado; falha aqui não derruba o resultado de NF-e)
      try {
        const cte = await this.syncCompanyCte(company);
        item.novosCte = cte.novos;
      } catch (e: any) {
        this.logger.error(`Sync CT-e ${company.nome}: ${e.message}`);
        item.cteErro = e.message;
      }

      resumo.push(item);
    }
    return { empresas: resumo };
  }

  private async syncCompany(company: SefazCompany) {
    const cursor = await this.prisma.sefazCursor.findUnique({ where: { cnpj: company.cnpj } });
    let ultNsu = cursor?.ultNsu || '0';
    let novos = 0;
    let maxNSU = ultNsu;
    let cStat = '';
    let xMotivo = '';

    // A SEFAZ entrega ~50 docs por chamada; repetimos até zerar (com teto de segurança).
    for (let i = 0; i < 50; i++) {
      const r = await this.callDistribuicao(company, ultNsu);
      maxNSU = r.maxNSU;
      cStat = r.cStat;
      xMotivo = r.xMotivo;

      // 137 = nenhum documento; 138 = documentos localizados
      if (r.cStat !== '138' && r.docs.length === 0) {
        ultNsu = r.ultNSU;
        break;
      }

      for (const doc of r.docs) {
        const created = await this.persistDoc(company, doc);
        if (created) novos++;
      }
      ultNsu = r.ultNSU;

      await this.prisma.sefazCursor.upsert({
        where: { cnpj: company.cnpj },
        update: { ultNsu, maxNsu: maxNSU },
        create: { cnpj: company.cnpj, ultNsu, maxNsu: maxNSU },
      });

      // chegou ao fim
      if (Number(ultNsu) >= Number(maxNSU) || r.docs.length === 0) break;
      await new Promise((res) => setTimeout(res, 600));
    }

    return { novos, ultNSU: ultNsu, maxNSU, cStat, xMotivo };
  }

  /** Varre a distribuição de CT-e da empresa (NSU próprio, separado do de NF-e). */
  private async syncCompanyCte(company: SefazCompany) {
    const cursor = await this.prisma.sefazCursor.findUnique({ where: { cnpj: company.cnpj } });
    let ultNsu = cursor?.ultNsuCte || '0';
    let novos = 0;
    let maxNSU = ultNsu;

    for (let i = 0; i < 50; i++) {
      const r = await this.callDistribuicaoCte(company, ultNsu);
      maxNSU = r.maxNSU;

      // 137 = nenhum documento; 138 = documentos localizados
      if (r.cStat !== '138' && r.docs.length === 0) {
        ultNsu = r.ultNSU;
        break;
      }

      for (const doc of r.docs) {
        const created = await this.persistDoc(company, doc);
        if (created) novos++;
      }
      ultNsu = r.ultNSU;

      await this.prisma.sefazCursor.upsert({
        where: { cnpj: company.cnpj },
        update: { ultNsuCte: ultNsu, maxNsuCte: maxNSU },
        create: { cnpj: company.cnpj, ultNsuCte: ultNsu, maxNsuCte: maxNSU },
      });

      if (Number(ultNsu) >= Number(maxNSU) || r.docs.length === 0) break;
      await new Promise((res) => setTimeout(res, 600));
    }

    return { novos, ultNSU: ultNsu, maxNSU };
  }

  /** Extrai os dados de um documento (NF-e, NFC-e ou CT-e), resumo ou completo. */
  private extractDoc(parsed: any): {
    tipoDoc: 'NFE' | 'NFCE' | 'CTE';
    full: boolean;
    chave: string;
    emitenteCnpj?: string;
    emitenteNome?: string;
    numero?: string;
    serie?: string;
    valor?: number;
    dataEmissao?: string;
  } | null {
    // ----- NF-e / NFC-e -----
    if (parsed?.resNFe) {
      const r = parsed.resNFe;
      return {
        tipoDoc: 'NFE',
        full: false,
        chave: String(r.chNFe || ''),
        emitenteCnpj: r.CNPJ ? String(r.CNPJ) : undefined,
        emitenteNome: r.xNome ? String(r.xNome) : undefined,
        valor: r.vNF ? Number(r.vNF) : undefined,
        dataEmissao: this.isoDate(r.dhEmi),
      };
    }
    const infNFe = parsed?.nfeProc?.NFe?.infNFe || parsed?.NFe?.infNFe;
    if (infNFe) {
      const mod = String(infNFe.ide?.mod || '55');
      return {
        tipoDoc: mod === '65' ? 'NFCE' : 'NFE',
        full: true,
        chave: String(infNFe['@_Id'] || '').replace(/\D/g, ''),
        emitenteCnpj: infNFe.emit?.CNPJ ? String(infNFe.emit.CNPJ) : undefined,
        emitenteNome: infNFe.emit?.xNome ? String(infNFe.emit.xNome) : undefined,
        numero: infNFe.ide?.nNF ? String(infNFe.ide.nNF) : undefined,
        serie: infNFe.ide?.serie ? String(infNFe.ide.serie) : undefined,
        valor: infNFe.total?.ICMSTot?.vNF ? Number(infNFe.total.ICMSTot.vNF) : undefined,
        dataEmissao: this.isoDate(infNFe.ide?.dhEmi || infNFe.ide?.dEmi),
      };
    }
    // ----- CT-e (fretes/carretos) -----
    if (parsed?.resCTe) {
      const r = parsed.resCTe;
      return {
        tipoDoc: 'CTE',
        full: false,
        chave: String(r.chCTe || ''),
        emitenteCnpj: r.CNPJ ? String(r.CNPJ) : undefined,
        emitenteNome: r.xNome ? String(r.xNome) : undefined,
        valor: r.vTPrest ? Number(r.vTPrest) : undefined,
        dataEmissao: this.isoDate(r.dhEmi),
      };
    }
    const infCte =
      parsed?.cteProc?.CTe?.infCte ||
      parsed?.procCTe?.CTe?.infCte ||
      parsed?.CTe?.infCte ||
      parsed?.cteOSProc?.CTeOS?.infCte ||
      parsed?.CTeOS?.infCte;
    if (infCte) {
      return {
        tipoDoc: 'CTE',
        full: true,
        chave: String(infCte['@_Id'] || '').replace(/\D/g, ''),
        emitenteCnpj: infCte.emit?.CNPJ ? String(infCte.emit.CNPJ) : undefined,
        emitenteNome: infCte.emit?.xNome ? String(infCte.emit.xNome) : undefined,
        numero: infCte.ide?.nCT ? String(infCte.ide.nCT) : undefined,
        serie: infCte.ide?.serie ? String(infCte.ide.serie) : undefined,
        valor: infCte.vPrest?.vTPrest ? Number(infCte.vPrest.vTPrest) : undefined,
        dataEmissao: this.isoDate(infCte.ide?.dhEmi),
      };
    }
    return null;
  }

  /** Persiste um documento (NF-e/NFC-e/CT-e, resumo ou completo). Retorna true se criou. */
  private async persistDoc(
    company: SefazCompany,
    doc: { nsu: string; schema: string; xml: string },
  ): Promise<boolean> {
    if (!doc.xml) return false;
    const schema = (doc.schema || '').toLowerCase();

    // Eventos (cancelamento, ciência, carta de correção) não são documentos — pulamos
    if (schema.includes('evento')) return false;

    const parsed = this.parser.parse(doc.xml);
    const info = this.extractDoc(parsed);
    if (!info || !info.chave) return false;
    const full = info.full;

    const existing = await this.prisma.receivedNfe.findUnique({ where: { chave: info.chave } });
    if (existing) {
      // Se já existe como resumo e agora veio completo, atualiza com o XML
      if (full && existing.resumoOnly) {
        const stored = await this.storeXml(info.tipoDoc, info.chave, info.dataEmissao, doc.xml);
        await this.prisma.receivedNfe.update({
          where: { chave: info.chave },
          data: {
            numero: info.numero ?? existing.numero,
            serie: info.serie ?? existing.serie,
            valor: info.valor != null ? new Prisma.Decimal(info.valor) : existing.valor,
            driveFileId: stored.driveFileId,
            driveLink: stored.driveLink,
            hasXml: true,
            resumoOnly: false,
          },
        });
      }
      return false;
    }

    let driveFileId: string | null = null;
    let driveLink: string | null = null;
    if (full) {
      const stored = await this.storeXml(info.tipoDoc, info.chave, info.dataEmissao, doc.xml);
      driveFileId = stored.driveFileId;
      driveLink = stored.driveLink;
    }

    await this.prisma.receivedNfe.create({
      data: {
        empresaCnpj: company.cnpj,
        empresaNome: company.nome,
        empresaUf: company.uf,
        chave: info.chave,
        nsu: doc.nsu,
        tipoDoc: info.tipoDoc,
        emitenteCnpj: info.emitenteCnpj,
        emitenteNome: info.emitenteNome,
        numero: info.numero,
        serie: info.serie,
        valor: info.valor != null ? new Prisma.Decimal(info.valor) : null,
        dataEmissao: info.dataEmissao ? new Date(`${info.dataEmissao}T00:00:00.000Z`) : null,
        kind: InvoiceKind.ICMS,
        driveFileId,
        driveLink,
        hasXml: full,
        resumoOnly: !full,
      },
    });
    return true;
  }

  private async storeXml(
    tipoDoc: string,
    chave: string,
    dataEmissao: string | undefined,
    xml: string,
  ) {
    const [year, month] = (dataEmissao || '0000-00').split('-');
    const pasta = tipoDoc === 'CTE' ? 'CT-e' : tipoDoc === 'NFCE' ? 'NFC-e' : 'NF-e';
    return this.drive.uploadToSegments(
      Buffer.from(xml, 'utf8'),
      `${chave}.xml`,
      'application/xml',
      ['Recebidas SEFAZ', pasta, year || 'sem-data', month || '00'],
    );
  }

  private isoDate(dh: any): string | undefined {
    if (!dh) return undefined;
    const m = String(dh).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
  }

  // ---------- Consulta das notas capturadas ----------
  // Todas as notas recebidas (ICMS) são visíveis a todos os perfis — sem filtro por tipo.
  async listReceived(params: { empresaCnpj?: string; limit?: number } = {}) {
    const where: Prisma.ReceivedNfeWhereInput = {};
    if (params.empresaCnpj) where.empresaCnpj = params.empresaCnpj;

    const rows = await this.prisma.receivedNfe.findMany({
      where,
      orderBy: { dataEmissao: 'desc' },
      take: params.limit ?? 500,
    });

    return rows.map((r) => ({
      id: r.id,
      empresaNome: r.empresaNome,
      empresaCnpj: r.empresaCnpj,
      empresaUf: r.empresaUf,
      chave: r.chave,
      tipoDoc: r.tipoDoc,
      emitenteNome: r.emitenteNome,
      emitenteCnpj: r.emitenteCnpj,
      numero: r.numero,
      serie: r.serie,
      valor: r.valor != null ? Number(r.valor) : null,
      dataEmissao: r.dataEmissao ? r.dataEmissao.toISOString().slice(0, 10) : null,
      kind: r.kind,
      driveLink: r.driveLink,
      hasXml: r.hasXml,
      capturedAt: r.capturedAt,
    }));
  }

  /** Empresas configuradas para o filtro do frontend. */
  empresasFiltro() {
    return this.companies().map((c) => ({ cnpj: c.cnpj, nome: c.nome, uf: c.uf }));
  }

  private async fetchNoteXml(id: string) {
    const note = await this.prisma.receivedNfe.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota não encontrada.');
    if (!note.driveFileId && !note.driveLink) {
      throw new BadRequestException(
        'XML indisponível: esta nota veio apenas como resumo. Faça a manifestação para baixar o XML completo.',
      );
    }
    const buf = await this.drive.download(note.driveFileId, null);
    if (!buf) throw new BadRequestException('Não foi possível obter o XML do arquivo.');
    return { note, xml: buf.toString('utf8') };
  }

  async getXml(id: string) {
    const { note, xml } = await this.fetchNoteXml(id);
    return { filename: `${note.chave}.xml`, content: Buffer.from(xml, 'utf8') };
  }

  /** Gera o DANFE (PDF) simplificado a partir do XML completo da nota. */
  async getPdf(id: string) {
    const { note, xml } = await this.fetchNoteXml(id);
    const content = await this.danfe.buildDanfe(xml);
    return { filename: `${note.chave}.pdf`, content };
  }

  // ---------- Manifestação do Destinatário (Ciência da Operação) ----------

  private companyByCnpj(cnpj: string): SefazCompany | undefined {
    const digits = (cnpj || '').replace(/\D/g, '');
    return this.companies().find((c) => c.cnpj === digits);
  }

  /** Extrai a chave privada e o certificado (PEM) do .pfx da empresa. */
  private certPem(company: SefazCompany): CertPem {
    const der = forge.util.createBuffer(company.pfx.toString('binary'));
    const asn1 = forge.asn1.fromDer(der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, company.senha);

    let key: forge.pki.PrivateKey | null = null;
    const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const plain = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyBag =
      shrouded[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] || plain[forge.pki.oids.keyBag]?.[0];
    if (keyBag?.key) key = keyBag.key;

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];

    if (!key || !certBag?.cert) {
      throw new BadRequestException(
        `Certificado de ${company.nome} inválido ou senha incorreta — não foi possível ler chave/certificado.`,
      );
    }
    return {
      keyPem: forge.pki.privateKeyToPem(key as forge.pki.rsa.PrivateKey),
      certPem: forge.pki.certificateToPem(certBag.cert),
    };
  }

  private recepcaoEventoUrl(): string {
    const override = (this.config.get<string>('SEFAZ_RECEPCAO_EVENTO_URL', '') || '').trim();
    if (override) return override;
    return RECEPCAO_EVENTO_ENDPOINTS[this.tpAmb() as '1' | '2'];
  }

  /** dhEvento no formato YYYY-MM-DDTHH:mm:ss-03:00 */
  private nowOffset(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    // -03:00 (horário de Brasília, sem horário de verão)
    const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return (
      `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
      `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}-03:00`
    );
  }

  /** Monta e assina (XMLDSig) o evento de Ciência da Operação. */
  private buildSignedEvento(company: SefazCompany, chave: string, nSeqEvento: number): string {
    const seq = String(nSeqEvento);
    const id = `ID${TP_EVENTO_CIENCIA}${chave}${String(nSeqEvento).padStart(2, '0')}`;
    const evento =
      `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
      `<infEvento Id="${id}">` +
      `<cOrgao>91</cOrgao>` +
      `<tpAmb>${this.tpAmb()}</tpAmb>` +
      `<CNPJ>${company.cnpj}</CNPJ>` +
      `<chNFe>${chave}</chNFe>` +
      `<dhEvento>${this.nowOffset()}</dhEvento>` +
      `<tpEvento>${TP_EVENTO_CIENCIA}</tpEvento>` +
      `<nSeqEvento>${seq}</nSeqEvento>` +
      `<verEvento>1.00</verEvento>` +
      `<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento>` +
      `</infEvento>` +
      `</evento>`;

    const { keyPem, certPem } = this.certPem(company);
    const sig = new SignedXml({
      privateKey: keyPem,
      publicCert: certPem,
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });
    sig.addReference({
      xpath: "//*[local-name(.)='infEvento']",
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      ],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    });
    sig.computeSignature(evento, {
      location: { reference: "//*[local-name(.)='infEvento']", action: 'after' },
    });
    return sig.getSignedXml();
  }

  /** Envia o evento de Ciência da Operação para a SEFAZ. */
  private async enviarCiencia(company: SefazCompany, chave: string, nSeqEvento = 1) {
    const signedEvento = this.buildSignedEvento(company, chave, nSeqEvento);
    const envEvento =
      `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
      `<idLote>1</idLote>` +
      signedEvento +
      `</envEvento>`;

    const soap =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
      '<soap12:Body>' +
      '<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">' +
      envEvento +
      '</nfeDadosMsg>' +
      '</soap12:Body>' +
      '</soap12:Envelope>';

    const agent = new https.Agent({ pfx: company.pfx, passphrase: company.senha });
    let res;
    try {
      res = await axios.post(this.recepcaoEventoUrl(), soap, {
        httpsAgent: agent,
        timeout: 60_000,
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      });
    } catch (e: any) {
      const msg = e?.response?.data ? String(e.response.data).slice(0, 300) : e.message;
      throw new BadRequestException(`SEFAZ (${company.nome}): falha na manifestação — ${msg}`);
    }

    const parsed = this.parser.parse(res.data);
    const body = parsed?.Envelope?.Body;
    const ret =
      body?.nfeRecepcaoEventoResponse?.nfeRecepcaoEventoResult?.retEnvEvento ||
      body?.nfeResultMsg?.retEnvEvento ||
      body?.retEnvEvento;
    if (!ret) {
      throw new BadRequestException(`SEFAZ (${company.nome}): resposta inesperada na manifestação.`);
    }

    const retEvento = Array.isArray(ret.retEvento) ? ret.retEvento[0] : ret.retEvento;
    const inf = retEvento?.infEvento || {};
    const cStat = String(inf.cStat || ret.cStat || '');
    const xMotivo = String(inf.xMotivo || ret.xMotivo || '');
    // 135/136 = registrado; 155 = registrado fora de prazo; 573 = evento já registrado (duplicidade)
    const ok = ['135', '136', '155', '573'].includes(cStat);
    return { ok, cStat, xMotivo };
  }

  /** Consulta o XML completo de uma NF-e específica pela chave (após manifestação). */
  private async fetchFullByChave(company: SefazCompany, chave: string): Promise<string | null> {
    const cUF = UF_IBGE[company.uf] || '35';
    const soap =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
      '<soap12:Body>' +
      '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">' +
      '<nfeDadosMsg>' +
      '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">' +
      `<tpAmb>${this.tpAmb()}</tpAmb>` +
      `<cUFAutor>${cUF}</cUFAutor>` +
      `<CNPJ>${company.cnpj}</CNPJ>` +
      `<consChNFe><chNFe>${chave}</chNFe></consChNFe>` +
      '</distDFeInt>' +
      '</nfeDadosMsg>' +
      '</nfeDistDFeInteresse>' +
      '</soap12:Body>' +
      '</soap12:Envelope>';

    const agent = new https.Agent({ pfx: company.pfx, passphrase: company.senha });
    let res;
    try {
      res = await axios.post(ENDPOINTS[this.tpAmb() as '1' | '2'], soap, {
        httpsAgent: agent,
        timeout: 60_000,
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      });
    } catch (e: any) {
      const msg = e?.response?.data ? String(e.response.data).slice(0, 300) : e.message;
      throw new BadRequestException(`SEFAZ (${company.nome}): falha ao buscar o XML — ${msg}`);
    }

    const parsed = this.parser.parse(res.data);
    const ret =
      parsed?.Envelope?.Body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt;
    const lote = ret?.loteDistDFeInt?.docZip;
    const arr = lote ? (Array.isArray(lote) ? lote : [lote]) : [];
    for (const d of arr) {
      const xml = this.gunzip(String(d['#text'] || d || ''));
      const schema = String(d['@_schema'] || '').toLowerCase();
      // Queremos o documento completo (procNFe), não o resumo
      if (xml && (schema.includes('procnfe') || xml.includes('<nfeProc'))) {
        return xml;
      }
    }
    return null;
  }

  /** Manifesta (Ciência da Operação) uma nota e baixa o XML completo. */
  async manifestarNota(id: string) {
    const note = await this.prisma.receivedNfe.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota não encontrada.');
    if (note.tipoDoc === 'CTE') {
      throw new BadRequestException('A manifestação do destinatário não se aplica a CT-e.');
    }
    const company = this.companyByCnpj(note.empresaCnpj);
    if (!company) {
      throw new BadRequestException(
        'Empresa desta nota não está configurada no servidor (certificado ausente).',
      );
    }

    const manifest = await this.enviarCiencia(company, note.chave);
    if (!manifest.ok) {
      throw new BadRequestException(
        `Manifestação não registrada (cStat ${manifest.cStat}): ${manifest.xMotivo}`,
      );
    }

    // Após a Ciência, o XML completo fica disponível via consulta por chave
    let hasXml = note.hasXml;
    const fullXml = await this.fetchFullByChave(company, note.chave);
    if (fullXml) {
      const dataEmissao = note.dataEmissao ? note.dataEmissao.toISOString().slice(0, 10) : undefined;
      const stored = await this.storeXml('NFE', note.chave, dataEmissao, fullXml);
      await this.prisma.receivedNfe.update({
        where: { id },
        data: {
          driveFileId: stored.driveFileId,
          driveLink: stored.driveLink,
          hasXml: true,
          resumoOnly: false,
        },
      });
      hasXml = true;
    }

    return { ok: true, cStat: manifest.cStat, xMotivo: manifest.xMotivo, hasXml };
  }

  /** Manifesta todas as notas que ainda estão como resumo (sem XML completo). */
  async manifestarTodas() {
    const pendentes = await this.prisma.receivedNfe.findMany({
      where: { resumoOnly: true, tipoDoc: { not: 'CTE' } },
      select: { id: true, chave: true },
    });

    let manifestadas = 0;
    let comXml = 0;
    const erros: Array<{ chave: string; erro: string }> = [];
    for (const n of pendentes) {
      try {
        const r = await this.manifestarNota(n.id);
        manifestadas++;
        if (r.hasXml) comXml++;
      } catch (e: any) {
        erros.push({ chave: n.chave, erro: e?.message || 'erro' });
      }
      await new Promise((res) => setTimeout(res, 800));
    }
    return { total: pendentes.length, manifestadas, comXml, erros };
  }
}
