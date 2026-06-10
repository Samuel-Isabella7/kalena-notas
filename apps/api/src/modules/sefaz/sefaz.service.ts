import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';
import * as zlib from 'zlib';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { InvoiceKind, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DriveService } from '../storage/drive.service';
import { allowedKinds } from '../../common/utils/role-scope';

interface SefazCompany {
  key: string;
  nome: string;
  cnpj: string; // só dígitos
  uf: string;
  pfx: Buffer;
  senha: string;
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

  /** Uma chamada ao DistribuicaoDFe a partir do ultNSU. */
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
      ultNSU: String(ret.ultNSU || ultNsu),
      maxNSU: String(ret.maxNSU || ultNsu),
      docs,
    };
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
      try {
        if (reset) {
          await this.prisma.sefazCursor.upsert({
            where: { cnpj: company.cnpj },
            update: { ultNsu: '0' },
            create: { cnpj: company.cnpj, ultNsu: '0' },
          });
        }
        const r = await this.syncCompany(company);
        resumo.push({ empresa: company.nome, ...r });
      } catch (e: any) {
        this.logger.error(`Sync ${company.nome}: ${e.message}`);
        resumo.push({ empresa: company.nome, erro: e.message });
      }
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
      parsed?.CTe?.infCte;
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
  async listReceived(params: { kinds: InvoiceKind[]; empresaCnpj?: string; limit?: number }) {
    const where: Prisma.ReceivedNfeWhereInput = { kind: { in: params.kinds } };
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
  empresasFiltro(role: Role) {
    // (o filtro por tipo não se aplica aqui — todas as recebidas são ICMS)
    void role;
    return this.companies().map((c) => ({ cnpj: c.cnpj, nome: c.nome, uf: c.uf }));
  }

  private async fetchNoteXml(id: string, role: Role) {
    const note = await this.prisma.receivedNfe.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota não encontrada.');
    if (!allowedKinds(role).includes(note.kind)) {
      throw new ForbiddenException('Você não tem acesso a este tipo de nota.');
    }
    if (!note.driveFileId && !note.driveLink) {
      throw new BadRequestException(
        'XML indisponível: esta nota veio apenas como resumo. Faça a manifestação para baixar o XML completo.',
      );
    }
    const buf = await this.drive.download(note.driveFileId, null);
    if (!buf) throw new BadRequestException('Não foi possível obter o XML do arquivo.');
    return { note, xml: buf.toString('utf8') };
  }

  async getXml(id: string, role: Role) {
    const { note, xml } = await this.fetchNoteXml(id, role);
    return { filename: `${note.chave}.xml`, content: Buffer.from(xml, 'utf8') };
  }
}
