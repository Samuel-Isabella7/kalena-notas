import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import PDFDocument from 'pdfkit';

/**
 * Gera um DANFE *simplificado* (PDF) a partir do XML completo de uma NF-e/CT-e.
 * Não replica o layout oficial da SEFAZ — apresenta os dados principais de forma
 * limpa e legível, suficiente para conferência e arquivamento.
 */
@Injectable()
export class DanfeService {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
  });

  /** Constrói o PDF a partir do XML (procNFe/NFe ou procCTe/CTe). Retorna o Buffer. */
  async buildDanfe(xml: string): Promise<Buffer> {
    const parsed = this.parser.parse(xml);
    const infNFe = parsed?.nfeProc?.NFe?.infNFe || parsed?.NFe?.infNFe;
    const infCte =
      parsed?.cteProc?.CTe?.infCte || parsed?.procCTe?.CTe?.infCte || parsed?.CTe?.infCte;

    if (infNFe) return this.render(this.fromNFe(infNFe));
    if (infCte) return this.render(this.fromCTe(infCte));
    // XML sem estrutura completa (resumo) — não há o que renderizar
    return this.render({
      titulo: 'Documento Fiscal',
      chave: this.idToChave(infNFe?.['@_Id'] || infCte?.['@_Id']),
      linhas: [['Aviso', 'XML completo indisponível. Faça a manifestação para obter o documento.']],
      itens: [],
    });
  }

  private idToChave(id: any): string {
    return String(id || '').replace(/\D/g, '');
  }

  private fmtMoney(v: any): string {
    const n = Number(v);
    if (!isFinite(n)) return '-';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  }

  private fmtDoc(doc: any): string {
    const d = String(doc || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return d || '-';
  }

  private fmtDate(dh: any): string {
    const m = String(dh || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '-';
  }

  private fromNFe(inf: any): DanfeData {
    const emit = inf.emit || {};
    const dest = inf.dest || {};
    const ide = inf.ide || {};
    const tot = inf.total?.ICMSTot || {};
    const dets = inf.det ? (Array.isArray(inf.det) ? inf.det : [inf.det]) : [];
    return {
      titulo: `DANFE — NF-e nº ${ide.nNF || '-'} / série ${ide.serie || '-'}`,
      chave: this.idToChave(inf['@_Id']),
      linhas: [
        ['Emitente', `${emit.xNome || '-'} (${this.fmtDoc(emit.CNPJ || emit.CPF)})`],
        ['UF / Município', `${emit.enderEmit?.UF || '-'} — ${emit.enderEmit?.xMun || '-'}`],
        ['Destinatário', `${dest.xNome || '-'} (${this.fmtDoc(dest.CNPJ || dest.CPF)})`],
        ['Emissão', this.fmtDate(ide.dhEmi || ide.dEmi)],
        ['Natureza da operação', String(ide.natOp || '-')],
        ['Valor total da nota', this.fmtMoney(tot.vNF)],
      ],
      itens: dets.map((d: any) => {
        const p = d.prod || {};
        return {
          desc: String(p.xProd || '-'),
          qtd: String(p.qCom || '-'),
          unit: this.fmtMoney(p.vUnCom),
          total: this.fmtMoney(p.vProd),
        };
      }),
    };
  }

  private fromCTe(inf: any): DanfeData {
    const emit = inf.emit || {};
    const ide = inf.ide || {};
    const vPrest = inf.vPrest || {};
    return {
      titulo: `DACTE — CT-e nº ${ide.nCT || '-'} / série ${ide.serie || '-'}`,
      chave: this.idToChave(inf['@_Id']),
      linhas: [
        ['Emitente', `${emit.xNome || '-'} (${this.fmtDoc(emit.CNPJ || emit.CPF)})`],
        ['UF', String(emit.enderEmit?.UF || ide.UFIni || '-')],
        ['Emissão', this.fmtDate(ide.dhEmi)],
        ['CFOP', String(ide.CFOP || '-')],
        ['Valor total da prestação', this.fmtMoney(vPrest.vTPrest)],
      ],
      itens: [],
    };
  }

  private render(data: DanfeData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Cabeçalho
      doc.fontSize(16).fillColor('#0f172a').text('KALENA FOODS', { continued: false });
      doc.fontSize(11).fillColor('#334155').text(data.titulo);
      doc.moveDown(0.4);
      doc.fontSize(8).fillColor('#64748b').text(`Chave de acesso: ${data.chave || '-'}`);
      doc.moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.8);

      // Dados principais
      doc.fontSize(10).fillColor('#0f172a');
      for (const [label, value] of data.linhas) {
        const y = doc.y;
        doc.fillColor('#64748b').fontSize(8).text(label.toUpperCase(), 40, y);
        doc.fillColor('#0f172a').fontSize(10).text(value, 40, doc.y, { width: 515 });
        doc.moveDown(0.5);
      }

      // Itens
      if (data.itens.length) {
        doc.moveDown(0.6);
        doc.fontSize(10).fillColor('#0f172a').text('Itens / Produtos');
        doc.moveDown(0.3);
        const top = doc.y;
        const cols = { desc: 40, qtd: 330, unit: 390, total: 470 };
        doc.fontSize(8).fillColor('#64748b');
        doc.text('Descrição', cols.desc, top);
        doc.text('Qtd', cols.qtd, top);
        doc.text('Vlr. unit.', cols.unit, top);
        doc.text('Total', cols.total, top);
        doc.moveTo(40, top + 12).lineTo(555, top + 12).strokeColor('#e2e8f0').stroke();
        doc.moveDown(1);
        doc.fillColor('#0f172a').fontSize(8);
        for (const it of data.itens) {
          if (doc.y > 760) doc.addPage();
          const y = doc.y;
          doc.text(it.desc, cols.desc, y, { width: 280 });
          const rowBottom = doc.y;
          doc.text(it.qtd, cols.qtd, y);
          doc.text(it.unit, cols.unit, y);
          doc.text(it.total, cols.total, y);
          doc.y = Math.max(rowBottom, y + 12);
          doc.moveDown(0.2);
        }
      }

      doc.moveDown(1);
      doc.fontSize(7).fillColor('#94a3b8').text(
        'DANFE simplificado gerado pelo sistema Kalena Notas a partir do XML autorizado. ' +
          'Não substitui o documento fiscal oficial.',
        { width: 515 },
      );

      doc.end();
    });
  }
}

interface DanfeData {
  titulo: string;
  chave: string;
  linhas: Array<[string, string]>;
  itens: Array<{ desc: string; qtd: string; unit: string; total: string }>;
}
