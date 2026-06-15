import { Injectable, Logger } from '@nestjs/common';
import pdf from 'pdf-parse';
import { AiExtractionService } from './ai-extraction.service';

export interface ExtractedInvoice {
  fornecedorDoc: string | null;
  fornecedorNome: string | null;
  numeroDocumento: string | null;
  valor: number | null;
  dataEmissao: string | null; // YYYY-MM-DD
  dataVencimento: string | null; // YYYY-MM-DD
  textOk: boolean; // false = não foi possível extrair nada (nem IA nem texto)
  source: 'ai' | 'regex' | 'none'; // de onde vieram os campos preenchidos
  rawSnippet: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly ai: AiExtractionService) {}

  async extract(buffer: Buffer, mimeType: string): Promise<ExtractedInvoice> {
    const empty: ExtractedInvoice = {
      fornecedorDoc: null,
      fornecedorNome: null,
      numeroDocumento: null,
      valor: null,
      dataEmissao: null,
      dataVencimento: null,
      textOk: false,
      source: 'none',
      rawSnippet: '',
    };

    if (mimeType !== 'application/pdf') {
      return empty;
    }

    // 1) IA (Gemini): lê o PDF direto, inclusive escaneado. Só roda se houver chave.
    if (this.ai.enabled()) {
      const aiData = await this.ai.extract(buffer, mimeType);
      if (aiData && this.hasAnyField(aiData)) {
        return { ...empty, ...aiData, textOk: true, source: 'ai' };
      }
      this.logger.log('IA sem resultado utilizável — usando heurística de regex.');
    }

    // 2) Fallback: heurística por regex sobre o texto do PDF
    let text = '';
    try {
      const data = await pdf(buffer);
      text = data.text || '';
    } catch (e: any) {
      this.logger.warn(`Não foi possível ler o PDF: ${e.message}`);
      return empty;
    }

    // PDF sem texto extraível (provavelmente imagem escaneada) e sem IA disponível
    if (text.replace(/\s/g, '').length < 20) {
      return { ...empty, rawSnippet: text.slice(0, 500) };
    }

    const fornecedorDoc = this.firstCnpj(text);
    return {
      fornecedorDoc,
      fornecedorNome: this.razaoSocial(text),
      numeroDocumento: this.numeroNota(text),
      valor: this.valorTotal(text),
      dataEmissao: this.dataEmissao(text),
      dataVencimento: this.dataVencimento(text),
      textOk: true,
      source: 'regex',
      rawSnippet: text.slice(0, 800),
    };
  }

  private hasAnyField(d: {
    fornecedorDoc: string | null;
    fornecedorNome: string | null;
    numeroDocumento: string | null;
    valor: number | null;
  }): boolean {
    return !!(d.fornecedorDoc || d.fornecedorNome || d.numeroDocumento || d.valor != null);
  }

  /** O primeiro CNPJ do DANFE costuma ser o do emitente (fornecedor). */
  private firstCnpj(text: string): string | null {
    const m = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (m) return m[0].replace(/\D/g, '');
    // CNPJ sem máscara (14 dígitos)
    const m2 = text.match(/\b\d{14}\b/);
    return m2 ? m2[0] : null;
  }

  private razaoSocial(text: string): string | null {
    // Tenta capturar texto após rótulos comuns; senão, a primeira linha "de empresa".
    const labeled = text.match(/RAZ[ÃA]O\s+SOCIAL[:\s]*([^\n]{3,80})/i);
    if (labeled) return this.clean(labeled[1]);

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    // Heurística: primeira linha "razoável" antes de aparecer um CNPJ.
    for (const line of lines.slice(0, 12)) {
      if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(line)) break;
      if (line.length >= 5 && /[A-Za-zÀ-ÿ]/.test(line) && !/DANFE|DOCUMENTO|AUXILIAR/i.test(line)) {
        return this.clean(line);
      }
    }
    return null;
  }

  private numeroNota(text: string): string | null {
    const patterns = [
      /N[ºo°]\.?\s*[:\-]?\s*(\d{1,3}(?:\.\d{3})+|\d{2,12})/i,
      /N[UÚ]MERO[:\s]*(\d{2,12})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1].replace(/\./g, '');
    }
    return null;
  }

  private valorTotal(text: string): number | null {
    const patterns = [
      /VALOR\s+TOTAL\s+DA\s+NOTA[\s\S]{0,40}?([\d.]+,\d{2})/i,
      /V\.?\s*TOTAL\s+DA\s+NOTA[\s\S]{0,40}?([\d.]+,\d{2})/i,
      /VALOR\s+TOTAL\s+DO\s+DOCUMENTO[\s\S]{0,40}?([\d.]+,\d{2})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return this.parseMoney(m[1]);
    }
    return null;
  }

  private dataEmissao(text: string): string | null {
    const m =
      text.match(/DATA\s+D[AE]\s+EMISS[ÃA]O[\s\S]{0,30}?(\d{2}\/\d{2}\/\d{4})/i) ||
      text.match(/EMISS[ÃA]O[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    return m ? this.toIso(m[1]) : null;
  }

  private dataVencimento(text: string): string | null {
    const m =
      text.match(/VENCIMENTO[\s\S]{0,40}?(\d{2}\/\d{2}\/\d{4})/i) ||
      text.match(/VENC\.?[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    return m ? this.toIso(m[1]) : null;
  }

  private parseMoney(s: string): number | null {
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  private toIso(br: string): string | null {
    const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  private clean(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
  }
}
