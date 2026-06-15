import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** Campos que a IA tenta extrair do PDF (mesmo formato do ExtractedInvoice). */
export interface AiExtractedFields {
  fornecedorDoc: string | null;
  fornecedorNome: string | null;
  numeroDocumento: string | null;
  valor: number | null;
  dataEmissao: string | null; // YYYY-MM-DD
  dataVencimento: string | null; // YYYY-MM-DD
}

/**
 * Leitura de notas fiscais por IA usando a API do Google Gemini (multimodal):
 * lê o PDF diretamente — inclusive os escaneados (imagem), onde a heurística de
 * regex falha. É opcional: sem GEMINI_API_KEY o serviço fica desligado e o
 * PdfService cai automaticamente para a leitura por regex.
 *
 * Modelo padrão: gemini-2.5-flash (grátis no Google AI Studio; ~250 docs/dia).
 * Trocável por GEMINI_MODEL (ex.: gemini-2.5-flash-lite p/ 1.000/dia, ou
 * gemini-3.5-flash p/ mais precisão).
 */
@Injectable()
export class AiExtractionService {
  private readonly logger = new Logger(AiExtractionService.name);

  constructor(private config: ConfigService) {}

  enabled(): boolean {
    return !!(this.config.get<string>('GEMINI_API_KEY') || '').trim();
  }

  private model(): string {
    return (this.config.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash').trim();
  }

  /** Extrai os campos do PDF via Gemini. Retorna null em qualquer falha (→ fallback regex). */
  async extract(buffer: Buffer, mimeType: string): Promise<AiExtractedFields | null> {
    if (!this.enabled() || mimeType !== 'application/pdf') return null;

    const key = (this.config.get<string>('GEMINI_API_KEY') || '').trim();
    const model = this.model();
    const timeout = Number(this.config.get<string>('GEMINI_TIMEOUT_MS') || '30000');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const body = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: buffer.toString('base64') } },
            { text: this.prompt() },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        response_mime_type: 'application/json',
        response_schema: this.schema(),
      },
    };

    try {
      const res = await axios.post(url, body, {
        timeout,
        headers: { 'Content-Type': 'application/json' },
      });
      const text: string =
        res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
      if (!text) {
        this.logger.warn('Gemini: resposta sem conteúdo.');
        return null;
      }
      const raw = JSON.parse(text);
      return this.normalize(raw);
    } catch (e: any) {
      const detail = e?.response?.data
        ? JSON.stringify(e.response.data).slice(0, 300)
        : e.message;
      this.logger.warn(`Gemini: falha na extração — ${detail}`);
      return null;
    }
  }

  private prompt(): string {
    return [
      'Você é um extrator de dados de notas fiscais brasileiras (DANFE de NF-e, DACTE de CT-e, NFS-e e recibos).',
      'Extraia APENAS os dados do EMITENTE (fornecedor/prestador) — NUNCA os do destinatário/tomador.',
      'Regras:',
      '- fornecedorDoc: CNPJ ou CPF do emitente, somente dígitos (sem pontos, barras ou traços).',
      '- fornecedorNome: razão social do emitente.',
      '- numeroDocumento: número da nota (somente dígitos, sem zeros à esquerda e sem série).',
      '- valor: valor total da nota como número decimal (ponto como separador decimal; ex.: 1234.56). Para CT-e use o valor total da prestação.',
      '- dataEmissao e dataVencimento: formato YYYY-MM-DD. Se o vencimento não existir, retorne null.',
      'Se um campo não estiver presente no documento, retorne null para ele. Responda somente o JSON.',
    ].join('\n');
  }

  private schema() {
    const nullableString = { type: 'STRING', nullable: true };
    return {
      type: 'OBJECT',
      properties: {
        fornecedorDoc: nullableString,
        fornecedorNome: nullableString,
        numeroDocumento: nullableString,
        valor: { type: 'NUMBER', nullable: true },
        dataEmissao: nullableString,
        dataVencimento: nullableString,
      },
      propertyOrdering: [
        'fornecedorDoc',
        'fornecedorNome',
        'numeroDocumento',
        'valor',
        'dataEmissao',
        'dataVencimento',
      ],
    };
  }

  /** Saneia o retorno do modelo (dígitos do doc, número do valor, datas ISO). */
  private normalize(raw: any): AiExtractedFields {
    return {
      fornecedorDoc: this.digits(raw?.fornecedorDoc),
      fornecedorNome: this.str(raw?.fornecedorNome),
      numeroDocumento: this.digits(raw?.numeroDocumento),
      valor: this.num(raw?.valor),
      dataEmissao: this.isoDate(raw?.dataEmissao),
      dataVencimento: this.isoDate(raw?.dataVencimento),
    };
  }

  private str(v: any): string | null {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, ' ').trim();
    return s || null;
  }

  private digits(v: any): string | null {
    if (v == null) return null;
    const d = String(v).replace(/\D/g, '');
    return d || null;
  }

  private num(v: any): number | null {
    if (v == null) return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    // string: pode vir "1.234,56" (BR) ou "1234.56" (US)
    let s = String(v).trim().replace(/[^\d.,-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return isNaN(n) ? null : n;
  }

  private isoDate(v: any): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); // dd/mm/yyyy
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
  }
}
