import PDFDocument from 'pdfkit';
import * as bwipjs from 'bwip-js';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
});

function money(v: any): string {
  const n = Number(v);
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function num(v: any, d = 4): string {
  const n = Number(v);
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: d });
}
function brDate(dh: any): string {
  const m = String(dh || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function doc(v: any): string {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return String(v || '');
}
function arr(x: any): any[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

export async function generateDanfe(xml: string): Promise<Buffer> {
  const parsed = parser.parse(xml);
  const inf = parsed?.nfeProc?.NFe?.infNFe || parsed?.NFe?.infNFe;
  if (!inf) throw new Error('XML não é uma NF-e completa.');

  const chave = String(inf['@_Id'] || '').replace(/\D/g, '');
  const ide = inf.ide || {};
  const emit = inf.emit || {};
  const dest = inf.dest || {};
  const enderE = emit.enderEmit || {};
  const enderD = dest.enderDest || {};
  const total = inf.total?.ICMSTot || {};
  const prot = parsed?.nfeProc?.protNFe?.infProt || {};
  const itens = arr(inf.det);

  const barcode = await bwipjs.toBuffer({
    bcid: 'code128',
    text: chave || '0',
    scale: 2,
    height: 9,
    includetext: false,
  });

  const pdf = new PDFDocument({ size: 'A4', margin: 28 });
  const chunks: Buffer[] = [];
  pdf.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const L = 28;
  const R = 567; // largura útil A4 (595-28)
  const W = R - L;

  const line = (y: number) => pdf.moveTo(L, y).lineTo(R, y).stroke();
  const label = (t: string, x: number, y: number) =>
    pdf.fontSize(5.5).fillColor('#555').text(t.toUpperCase(), x, y, { lineBreak: false });
  const val = (t: string, x: number, y: number, size = 8) =>
    pdf.fontSize(size).fillColor('#000').text(t || '', x, y, { lineBreak: false });

  // ===== Cabeçalho =====
  let y = L;
  pdf.rect(L, y, W, 70).stroke();
  // Emitente (esquerda)
  pdf.fontSize(10).fillColor('#000').text(String(emit.xNome || ''), L + 6, y + 8, { width: 250 });
  pdf
    .fontSize(7)
    .fillColor('#222')
    .text(
      `${enderE.xLgr || ''}, ${enderE.nro || ''} - ${enderE.xBairro || ''}\n` +
        `${enderE.xMun || ''} / ${enderE.UF || ''}  CEP ${enderE.CEP || ''}\n` +
        `CNPJ ${doc(emit.CNPJ)}   IE ${emit.IE || ''}`,
      L + 6,
      y + 26,
      { width: 250 },
    );

  // DANFE (centro)
  pdf.fontSize(13).fillColor('#000').text('DANFE', L + 270, y + 6, { width: 120, align: 'center' });
  pdf
    .fontSize(6)
    .text('Documento Auxiliar da Nota Fiscal Eletrônica', L + 262, y + 24, { width: 140, align: 'center' });
  pdf.fontSize(9).text(`${ide.tpNF === '1' ? '1 - SAÍDA' : '0 - ENTRADA'}`, L + 262, y + 38, { width: 140, align: 'center' });
  pdf
    .fontSize(8)
    .text(`Nº ${ide.nNF || ''}    Série ${ide.serie || ''}`, L + 262, y + 52, { width: 140, align: 'center' });

  // Barcode + chave (direita)
  try {
    pdf.image(barcode, L + 410, y + 8, { width: 145, height: 26 });
  } catch {
    /* ignore */
  }
  pdf.fontSize(5).fillColor('#555').text('CHAVE DE ACESSO', L + 410, y + 38);
  pdf.fontSize(7).fillColor('#000').text(chave.replace(/(.{4})/g, '$1 '), L + 410, y + 46, { width: 150 });

  y += 70;
  // Natureza / protocolo
  pdf.rect(L, y, W, 26).stroke();
  label('NATUREZA DA OPERAÇÃO', L + 6, y + 3);
  val(String(ide.natOp || ''), L + 6, y + 11, 8);
  label('PROTOCOLO DE AUTORIZAÇÃO', L + 320, y + 3);
  val(`${prot.nProt || ''}  ${brDate(prot.dhRecbto)}`, L + 320, y + 11, 8);

  y += 26;
  // ===== Destinatário =====
  pdf.fontSize(7).fillColor('#000').text('DESTINATÁRIO / REMETENTE', L, y + 2);
  y += 12;
  pdf.rect(L, y, W, 44).stroke();
  pdf.fontSize(9).text(String(dest.xNome || ''), L + 6, y + 6, { width: 360 });
  label('CNPJ / CPF', L + 410, y + 4);
  val(doc(dest.CNPJ || dest.CPF), L + 410, y + 12, 8);
  pdf
    .fontSize(7)
    .fillColor('#222')
    .text(
      `${enderD.xLgr || ''}, ${enderD.nro || ''} - ${enderD.xBairro || ''}  ` +
        `${enderD.xMun || ''}/${enderD.UF || ''}  CEP ${enderD.CEP || ''}   IE ${dest.IE || ''}`,
      L + 6,
      y + 24,
      { width: 530 },
    );

  y += 44;
  // ===== Totais =====
  pdf.fontSize(7).fillColor('#000').text('CÁLCULO DO IMPOSTO / TOTAIS', L, y + 2);
  y += 12;
  pdf.rect(L, y, W, 30).stroke();
  const tcols = [
    ['BASE ICMS', money(total.vBC)],
    ['VALOR ICMS', money(total.vICMS)],
    ['VALOR PRODUTOS', money(total.vProd)],
    ['FRETE', money(total.vFrete)],
    ['DESCONTO', money(total.vDesc)],
    ['VALOR TOTAL DA NOTA', money(total.vNF)],
  ];
  const cw = W / tcols.length;
  tcols.forEach((c, i) => {
    const x = L + i * cw;
    if (i > 0) pdf.moveTo(x, y).lineTo(x, y + 30).stroke();
    label(c[0], x + 4, y + 4);
    pdf.fontSize(i === tcols.length - 1 ? 9 : 8).fillColor('#000').text(`R$ ${c[1]}`, x + 4, y + 14, { width: cw - 6, lineBreak: false });
  });

  y += 30;
  // ===== Itens =====
  pdf.fontSize(7).fillColor('#000').text('DADOS DOS PRODUTOS / SERVIÇOS', L, y + 2);
  y += 12;
  const cols = [
    { t: 'CÓD', w: 50 },
    { t: 'DESCRIÇÃO', w: 230 },
    { t: 'NCM', w: 55 },
    { t: 'CFOP', w: 38 },
    { t: 'QTD', w: 50, a: 'right' as const },
    { t: 'V.UNIT', w: 55, a: 'right' as const },
    { t: 'V.TOTAL', w: 61, a: 'right' as const },
  ];
  // header
  pdf.rect(L, y, W, 14).fillAndStroke('#f0f0f0', '#000');
  let cx = L;
  pdf.fillColor('#000').fontSize(6);
  cols.forEach((c) => {
    pdf.text(c.t, cx + 3, y + 4, { width: c.w - 4, align: c.a || 'left', lineBreak: false });
    cx += c.w;
  });
  y += 14;

  const rowH = 13;
  pdf.fontSize(6.5).fillColor('#000');
  for (const it of itens) {
    const p = it.prod || {};
    if (y > 760) {
      pdf.addPage();
      y = L;
    }
    cx = L;
    const cells = [
      String(p.cProd || ''),
      String(p.xProd || ''),
      String(p.NCM || ''),
      String(p.CFOP || ''),
      num(p.qCom),
      num(p.vUnCom),
      money(p.vProd),
    ];
    cols.forEach((c, i) => {
      pdf.text(cells[i], cx + 3, y + 3, { width: c.w - 5, align: c.a || 'left', lineBreak: false });
      cx += c.w;
    });
    pdf.rect(L, y, W, rowH).stroke();
    y += rowH;
  }

  // ===== Informações adicionais =====
  const infAdic = inf.infAdic?.infCpl;
  if (infAdic) {
    if (y > 740) {
      pdf.addPage();
      y = L;
    }
    y += 6;
    pdf.fontSize(7).fillColor('#000').text('INFORMAÇÕES COMPLEMENTARES', L, y);
    y += 10;
    pdf.fontSize(6.5).fillColor('#222').text(String(infAdic), L + 4, y, { width: W - 8 });
  }

  pdf.end();
  return done;
}
