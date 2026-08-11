// [Giai đoạn 2 - Increment] Tầng bóc tách TÀI LIỆU: tách khỏi server.ts.
// Các hàm được sao chép NGUYÊN VĂN (không đổi hành vi). extractDocxText/extractXlsxText là hàm THUẦN (chỉ dùng zlib).
// extractTextFromAttachmentData nhận `getAi` qua tham số (dependency injection) để không phụ thuộc trực tiếp vào server.ts.
import zlib from "zlib";
import { PDFParse } from "pdf-parse";

// [Helper] Trích xuất văn bản từ file .docx KHÔNG cần thư viện ngoài:
// .docx là file nén ZIP -> tự đọc Central Directory, giải nén word/document.xml (deflate) rồi bóc chữ khỏi XML.
export function extractDocxText(buf: Buffer): string {
  try {
    // Tìm bản ghi End Of Central Directory (EOCD) - chữ ký 0x06054b50, dò ngược từ cuối.
    let eocd = -1;
    const minPos = Math.max(0, buf.length - 22 - 65536);
    for (let i = buf.length - 22; i >= minPos; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return '';
    const cdCount = buf.readUInt16LE(eocd + 10);
    const cdOffset = buf.readUInt32LE(eocd + 16);

    let p = cdOffset;
    let docXml = '';
    for (let n = 0; n < cdCount; n++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const fnLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf-8', p + 46, p + 46 + fnLen);
      if (name === 'word/document.xml') {
        const lfnLen = buf.readUInt16LE(localOffset + 26);
        const lextraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lfnLen + lextraLen;
        const raw = buf.subarray(dataStart, dataStart + compSize);
        if (method === 0) docXml = raw.toString('utf-8');
        else if (method === 8) docXml = zlib.inflateRawSync(raw).toString('utf-8');
        break;
      }
      p = p + 46 + fnLen + extraLen + commentLen;
    }
    if (!docXml) return '';

    // Chuyển XML Word -> văn bản thuần: giữ ngắt đoạn/tab, bỏ thẻ, giải mã thực thể XML.
    const text = docXml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/?>(?:<\/w:br>)?/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n');
    return text.trim();
  } catch {
    return '';
  }
}

// [Helper] Trích xuất văn bản từ file .xlsx KHÔNG cần thư viện ngoài (giống .docx: đọc ZIP + XML).
// Đọc sharedStrings + từng sheet -> ghép thành bảng text (mỗi ô cách nhau " | ", mỗi dòng xuống hàng),
// kèm cả URL từ hyperlink của ô -> giữ nguyên các link trong bảng để agent tra cứu.
export function extractXlsxText(buf: Buffer): string {
  try {
    const want = (n: string) =>
      n === 'xl/sharedStrings.xml' ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(n) ||
      /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(n);
    // Đọc các entry cần thiết trong ZIP (Central Directory + inflate).
    const entries: Record<string, Buffer> = {};
    let eocd = -1;
    const minPos = Math.max(0, buf.length - 22 - 65536);
    for (let i = buf.length - 22; i >= minPos; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return '';
    const cdCount = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < cdCount; n++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const fnLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf-8', p + 46, p + 46 + fnLen);
      if (want(name)) {
        const lfn = buf.readUInt16LE(localOffset + 26);
        const lex = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lfn + lex;
        const raw = buf.subarray(dataStart, dataStart + compSize);
        try { entries[name] = method === 0 ? raw : zlib.inflateRawSync(raw); } catch { /* bỏ qua entry lỗi */ }
      }
      p = p + 46 + fnLen + extraLen + commentLen;
    }

    const dec = (s: string) => s
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_m, d) => { try { return String.fromCodePoint(+d); } catch { return ''; } });
    const colOf = (ref: string) => { const m = (ref || '').match(/^([A-Z]+)/); if (!m) return 0; let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };

    // sharedStrings
    const shared: string[] = [];
    const sx = (entries['xl/sharedStrings.xml'] || Buffer.from('')).toString('utf-8');
    { const siRe = /<si>([\s\S]*?)<\/si>/g; let m: RegExpExecArray | null; while ((m = siRe.exec(sx))) { const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let tm: RegExpExecArray | null; let s = ''; while ((tm = tRe.exec(m[1]))) s += tm[1]; shared.push(dec(s)); } }

    const sheetNames = Object.keys(entries).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
    const outLines: string[] = [];
    for (const sn of sheetNames) {
      const xml = entries[sn].toString('utf-8');
      // hyperlink refs -> target (qua file .rels)
      const relName = 'xl/worksheets/_rels/' + sn.split('/').pop() + '.rels';
      const relMap: Record<string, string> = {};
      const rx = (entries[relName] || Buffer.from('')).toString('utf-8');
      { const r = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g; let m: RegExpExecArray | null; while ((m = r.exec(rx))) relMap[m[1]] = m[2]; }
      const hl: Record<string, string> = {};
      { const h = /<hyperlink[^>]*ref="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g; let m: RegExpExecArray | null; while ((m = h.exec(xml))) hl[m[1]] = relMap[m[2]] || ''; }
      const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g; let rm: RegExpExecArray | null;
      while ((rm = rowRe.exec(xml))) {
        const rowXml = rm[1];
        const cells: string[] = [];
        const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm: RegExpExecArray | null;
        while ((cm = cRe.exec(rowXml))) {
          const attrs = cm[1] || ''; const body = cm[2] || '';
          const ref = (attrs.match(/r="([^"]+)"/) || [])[1] || '';
          const type = (attrs.match(/t="([^"]+)"/) || [])[1] || '';
          let val = '';
          const vM = body.match(/<v>([\s\S]*?)<\/v>/);
          const isM = body.match(/<is>([\s\S]*?)<\/is>/);
          if (type === 's' && vM) val = shared[parseInt(vM[1], 10)] || '';
          else if (type === 'inlineStr' && isM) { const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let tm: RegExpExecArray | null; while ((tm = tRe.exec(isM[1]))) val += tm[1]; val = dec(val); }
          else if (vM) val = dec(vM[1]);
          if (ref && hl[ref] && !val.includes(hl[ref])) val = (val ? val + ' ' : '') + '(link: ' + hl[ref] + ')';
          cells[colOf(ref)] = val;
        }
        const line: string[] = [];
        for (let i = 0; i < cells.length; i++) line.push(cells[i] || '');
        if (line.some((x) => x && x.trim())) outLines.push(line.join(' | '));
      }
    }
    return outLines.join('\n').trim();
  } catch {
    return '';
  }
}

// [Helper] Bóc tách văn bản từ MỘT tệp đính kèm bất kỳ (PDF/DOCX/XLSX/TXT/CSV...).
// Dùng chung cho nạp kho tri thức & phân tích tài liệu trong luồng chat -> mọi nhà cung cấp AI đều đọc được.
// `getAi`: hàm trả về client Gemini (chỉ dùng cho OCR PDF scan). Truyền từ server để module này không phụ thuộc server.ts.
export async function extractTextFromAttachmentData(name: string, mimeType: string, base64: string, getAi?: () => any): Promise<string> {
  const lower = (name || '').toLowerCase();
  let buf: Buffer;
  try { buf = Buffer.from(base64, 'base64'); } catch { return ''; }
  const isPdf = (mimeType && mimeType.includes('pdf')) || lower.endsWith('.pdf');
  // Lưu ý: mimeType của .xlsx CŨNG chứa "officedocument" -> phải kiểm tra XLSX TRƯỚC DOCX.
  const isXlsx = (mimeType && (mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel'))) || lower.endsWith('.xlsx');
  const isDocx = !isXlsx && ((mimeType && (mimeType.includes('wordprocessingml') || mimeType.includes('msword'))) || lower.endsWith('.docx'));

  if (isPdf) {
    let text = '';
    try {
      const parser = new PDFParse({ data: buf });
      const d = await parser.getText();
      text = d.text ? d.text.trim() : '';
      await parser.destroy();
    } catch { /* thử OCR bên dưới */ }
    if (text.length < 50 && process.env.GEMINI_API_KEY && getAi) {
      try {
        const ai = getAi();
        const r = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [
            { inlineData: { mimeType: 'application/pdf', data: base64 } },
            { text: 'Trích xuất toàn bộ văn bản, số liệu, bảng biểu quan trọng bằng tiếng Việt từ tài liệu PDF này.' },
          ],
        });
        if (r.text) text = r.text.trim();
      } catch { /* bỏ qua */ }
    }
    return text;
  }
  if (isXlsx) {
    return extractXlsxText(buf);
  }
  if (isDocx) {
    return extractDocxText(buf);
  }
  // text/csv/json/md và loại khác: thử đọc UTF-8
  try { return buf.toString('utf-8'); } catch { return ''; }
}
