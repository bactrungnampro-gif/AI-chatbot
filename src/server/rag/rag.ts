// [PoC RAG] Retrieval-Augmented Generation dùng pgvector (Supabase) + embeddings Gemini.
// Mục tiêu: thay vì nhồi toàn bộ tri thức vào prompt, chỉ truy hồi các đoạn liên quan nhất -> giảm token/chi phí, tăng độ chính xác.

// Model embedding hiện hành của Gemini (text-embedding-004 đã bị gỡ khỏi v1beta embedContent).
// gemini-embedding-001 mặc định 3072 chiều nhưng hỗ trợ outputDimensionality -> ép 768 để khớp bảng vector(768).
export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIM = 768;
export const CHUNK_TABLE = 'kb_chunks';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chia nhỏ văn bản thành các đoạn ~2200 ký tự, chồng lấn 200 (chunk to hơn -> ít lần embedding hơn -> đỡ đụng rate limit).
export function chunkText(text: string, size = 2200, overlap = 200): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + size, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks;
}

// Tạo embedding cho 1 đoạn văn bản, có THỬ LẠI khi bị rate limit (429). Trả về mảng EMBED_DIM chiều đã chuẩn hóa, hoặc null.
export async function embedText(ai: any, text: string, retries = 4): Promise<number[] | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res: any = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: text,
        config: { outputDimensionality: EMBED_DIM },
      });
      let v: any =
        res?.embeddings?.[0]?.values ||
        res?.embedding?.values ||
        (Array.isArray(res?.embeddings) ? res.embeddings[0]?.values : null);
      if (!Array.isArray(v)) return null;
      if (v.length > EMBED_DIM) v = v.slice(0, EMBED_DIM); // Matryoshka: cắt xuống EMBED_DIM
      if (v.length !== EMBED_DIM) return null;
      let norm = 0;
      for (const x of v) norm += x * x;
      norm = Math.sqrt(norm) || 1;
      return v.map((x: number) => x / norm);
    } catch (e: any) {
      const msg = e?.message || String(e);
      const rateLimited = /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg);
      if (attempt < retries && rateLimited) {
        await sleep(1500 * Math.pow(2, attempt)); // 1.5s, 3s, 6s, 12s
        continue;
      }
      console.warn('[RAG] embed error:', msg);
      return null;
    }
  }
  return null;
}

// Chuẩn hóa 1 vector về EMBED_DIM (cắt Matryoshka + chuẩn hóa độ dài). Trả null nếu không hợp lệ.
function normalizeVec(v: any): number[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length > EMBED_DIM) v = v.slice(0, EMBED_DIM);
  if (v.length !== EMBED_DIM) return null;
  let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm) || 1;
  return v.map((x: number) => x / norm);
}

// Embedding THEO LÔ: gộp nhiều đoạn vào MỘT request -> giảm mạnh số request (đỡ chạm rate-limit/hạn ngạch) và nhanh hơn.
// Trả mảng vector (phần tử null nếu 1 đoạn lỗi) nếu thành công; trả null nếu cả lô lỗi/không đúng định dạng -> caller lùi về embed từng đoạn.
export async function embedTexts(ai: any, texts: string[], retries = 5): Promise<(number[] | null)[] | null> {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res: any = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: texts,
        config: { outputDimensionality: EMBED_DIM },
      });
      const arr: any[] = Array.isArray(res?.embeddings) ? res.embeddings : [];
      if (arr.length !== texts.length) return null; // API không trả đúng số vector -> để caller lùi về cách cũ
      return arr.map((e) => normalizeVec(e?.values));
    } catch (e: any) {
      const msg = e?.message || String(e);
      const rateLimited = /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg);
      if (attempt < retries && rateLimited) { await sleep(2000 * Math.pow(2, attempt)); continue; } // 2s,4s,8s,16s,32s
      console.warn('[RAG] batch embed error:', msg);
      return null;
    }
  }
  return null;
}

export interface IndexResult { sources: number; chunks: number; skipped: number; already: number; done: boolean; error?: string; }

// Xây dựng/cập nhật chỉ mục vector — RESUMABLE + CẬP NHẬT NỘI DUNG:
// so khớp theo NỘI DUNG từng đoạn -> chỉ nhúng lại đoạn MỚI hoặc ĐÃ ĐỔI, bỏ qua đoạn không đổi, xóa đoạn thừa.
// Bấm lại nhiều lần sẽ cộng dồn tới khi xong. maxChunks: số đoạn xử lý tối đa MỘT lần chạy. done=true nếu đã phủ hết.
export async function indexKnowledge(
  client: any,
  ai: any,
  sources: any[],
  maxChunks = 3000,
  onProgress?: (p: { chunks: number; sources: number; skipped: number; already: number }) => void,
  concurrency = 3
): Promise<IndexResult> {
  const active = (Array.isArray(sources) ? sources : []).filter((s) => s && s.active !== false && s.content);
  let newlyIndexed = 0;
  let indexedSources = 0;
  let skipped = 0;
  let already = 0;
  let capReached = false;

  for (const s of active) {
    const chunks = chunkText(s.content);

    // [Fix cập nhật nội dung] Đọc chunk hiện có CỦA RIÊNG nguồn này (kèm NỘI DUNG) để so khớp:
    // chỉ nhúng lại đoạn MỚI hoặc ĐÃ ĐỔI; đoạn không đổi thì bỏ qua (resumable); đoạn thừa thì xóa.
    const existing = new Map<number, string>();
    try {
      const { data } = await client.from(CHUNK_TABLE).select('chunk_index, content').eq('source_id', s.id);
      for (const r of (data || [])) if (typeof r?.chunk_index === 'number') existing.set(r.chunk_index, r.content || '');
    } catch (e: any) {
      // Lỗi đọc chỉ mục nguồn này -> bỏ qua nguồn ở lần chạy này (tránh nhúng lại toàn bộ do trục trặc tạm thời).
      console.warn('[RAG] read existing chunks error for', s.id, e?.message || e);
      continue;
    }

    // Xóa các chunk THỪA (chunk_index >= số chunk mới) khi nội dung ngắn đi -> tránh rác bị truy hồi.
    const orphanIdx = Array.from(existing.keys()).filter((k) => k >= chunks.length);
    if (orphanIdx.length) {
      try { await client.from(CHUNK_TABLE).delete().eq('source_id', s.id).gte('chunk_index', chunks.length); } catch { /* bỏ qua */ }
      for (const k of orphanIdx) existing.delete(k);
    }
    if (!chunks.length) continue;

    // pending = đoạn MỚI (chưa có) hoặc ĐÃ ĐỔI (nội dung khác bản đã lưu)
    const pending: { id: string; idx: number; text: string }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (existing.get(i) === chunks[i]) { already++; continue; } // không đổi -> bỏ qua
      pending.push({ id: `${s.id}_${i}`, idx: i, text: chunks[i] });
    }
    if (!pending.length) continue;

    let sourceHadNew = false;
    const rows: any[] = [];
    // Gộp nhiều đoạn/1 request để giảm số lần gọi API (đọc env lúc chạy để dotenv đã nạp xong).
    const batchSize = Math.max(1, parseInt(process.env.RAG_EMBED_BATCH || '32', 10) || 32);
    for (let i = 0; i < pending.length; i += batchSize) {
      if (newlyIndexed >= maxChunks) { capReached = true; break; }
      const batch = pending.slice(i, i + batchSize);
      let embs = await embedTexts(ai, batch.map((c) => c.text));
      if (!embs) {
        // Batch lỗi/không được hỗ trợ -> lùi về embed TỪNG đoạn (tuần tự, nhẹ nhàng để tránh rate-limit).
        embs = [];
        for (const c of batch) embs.push(await embedText(ai, c.text));
      }
      for (let j = 0; j < batch.length; j++) {
        if (newlyIndexed >= maxChunks) { capReached = true; break; }
        const emb = embs[j];
        if (!emb) { skipped++; continue; }
        rows.push({
          id: batch[j].id,
          source_id: s.id,
          chunk_index: batch[j].idx,
          content: batch[j].text,
          embedding: emb,
          updated_at: new Date().toISOString(),
        });
        newlyIndexed++;
        sourceHadNew = true;
      }
      // Ghi dần theo lô để không mất tiến độ nếu gián đoạn
      if (rows.length >= 50) {
        const { error } = await client.from(CHUNK_TABLE).upsert(rows.splice(0, rows.length), { onConflict: 'id' });
        if (error) return { sources: indexedSources, chunks: newlyIndexed, skipped, already, done: false, error: error.message };
      }
      if (onProgress) onProgress({ chunks: newlyIndexed, sources: indexedSources, skipped, already });
      await sleep(150); // giãn cách nhẹ giữa các request
      if (capReached) break;
    }
    if (rows.length) {
      const { error } = await client.from(CHUNK_TABLE).upsert(rows, { onConflict: 'id' });
      if (error) return { sources: indexedSources, chunks: newlyIndexed, skipped, already, done: false, error: error.message };
    }
    if (sourceHadNew) indexedSources++;
    if (onProgress) onProgress({ chunks: newlyIndexed, sources: indexedSources, skipped, already });
    if (capReached) break;
  }

  // done nếu không chạm cap và không còn đoạn nào bị lỗi bỏ qua (nghĩa là đã phủ hết những gì embed được)
  const done = !capReached;
  return { sources: indexedSources, chunks: newlyIndexed, skipped, already, done };
}

// Băm chuỗi rẻ tiền (djb2) -> phát hiện thay đổi kể cả khi sửa mà GIỮ NGUYÊN độ dài.
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
// Chữ ký nội dung 1 nguồn để phát hiện thay đổi (dùng hash thay vì chỉ độ dài).
export function sourceContentSig(s: any): string {
  const c = s?.content || '';
  return `${c.length}:${hashStr(c)}:${s?.title || ''}:${s?.active !== false ? 1 : 0}`;
}

// Lập lại chỉ mục cho một số nguồn (thêm mới / nội dung đổi): embed trước, có được mới xóa chunk cũ & ghi mới
// (để không mất chunk cũ nếu embedding lỗi). Trả về tổng số chunk đã ghi.
export async function reindexSources(client: any, ai: any, sources: any[], maxChunksPerSource = 800, concurrency = 3): Promise<number> {
  let total = 0;
  for (const s of (Array.isArray(sources) ? sources : [])) {
    if (!s?.id || !s.content) continue;
    const chunks = chunkText(s.content);
    const rows: any[] = [];
    for (let i = 0; i < chunks.length && rows.length < maxChunksPerSource; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      const embs = await Promise.all(batch.map((c) => embedText(ai, c)));
      for (let j = 0; j < batch.length; j++) {
        const emb = embs[j];
        if (!emb) continue;
        rows.push({ id: `${s.id}_${i + j}`, source_id: s.id, chunk_index: i + j, content: batch[j], embedding: emb, updated_at: new Date().toISOString() });
      }
      await sleep(200);
    }
    if (rows.length) {
      try { await client.from(CHUNK_TABLE).delete().eq('source_id', s.id); } catch { /* ignore */ }
      for (let i = 0; i < rows.length; i += 20) {
        const { error } = await client.from(CHUNK_TABLE).upsert(rows.slice(i, i + 20), { onConflict: 'id' });
        if (error) break;
      }
      total += rows.length;
    }
  }
  return total;
}

// Tách từ khóa/mã quan trọng khỏi câu hỏi (bỏ stopword tiếng Việt, giữ token >=4 ký tự hoặc có chữ số như "SDS", "102").
const VI_STOP = new Set(['của','và','là','có','cho','các','một','những','được','trong','khi','này','đó','với','thì','cần','muốn','làm','sao','như','thế','nào','bao','nhiêu','ạ','em','anh','chị','tôi','bạn','xin','hỏi','cái','về','gì','ở','đâu','hãy','cho','tôi','mình','ơi','vậy','ad','shop']);
// Khử dấu tiếng Việt + thường hóa -> khớp không dấu ("gia" ↔ "giá", "san pham" ↔ "sản phẩm").
export function foldVN(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

// Stopword ở dạng KHÔNG DẤU -> lọc được cả khi khách gõ thiếu dấu ("toi", "cua", "cac"...).
const VI_STOP_FOLDED = new Set(Array.from(VI_STOP).map(foldVN));

export function extractKeywords(q: string): string[] {
  const raw = (q || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  // giữ token >=3 ký tự hoặc có chữ số (bắt mã ngắn: "SDS", "SKU", "102"); loại stopword (so khớp không dấu).
  const words = raw.filter((w) => (w.length >= 3 || /\d/.test(w)) && !VI_STOP_FOLDED.has(foldVN(w)));
  return Array.from(new Set(words));
}

// Truy hồi các đoạn liên quan nhất tới câu hỏi — HYBRID: kết hợp vector (ngữ nghĩa) + từ khóa/mã (ILIKE).
// Vector bắt ý nghĩa; keyword bắt mã/số hiệu/tên chính xác mà vector hay bỏ lỡ (vd "SDS 102", mã SP).
// Trả về mảng { content, source_id, similarity } (rỗng nếu không có gì) hoặc null nếu lỗi hẳn.
export async function retrieveRelevant(
  client: any,
  ai: any,
  query: string,
  matchCount = 12
): Promise<Array<{ content: string; source_id: string; similarity: number }> | null> {
  if (!query || !query.trim()) return null;
  const merged = new Map<string, { content: string; source_id: string; similarity: number }>();
  const keyOf = (r: any) => `${r?.source_id || ''}#${typeof r?.chunk_index === 'number' ? r.chunk_index : (r?.content || '').slice(0, 60)}`;

  // 1) Tìm theo VECTOR (ngữ nghĩa)
  const emb = await embedText(ai, query);
  if (emb) {
    try {
      const { data, error } = await client.rpc('match_kb_chunks', { query_embedding: emb, match_count: matchCount });
      if (error) console.warn('[RAG] match rpc error:', error.message);
      else if (Array.isArray(data)) for (const d of data) merged.set(keyOf(d), { content: d.content, source_id: d.source_id, similarity: typeof d.similarity === 'number' ? d.similarity : 0.7 });
    } catch (e: any) {
      console.warn('[RAG] vector retrieve error:', e?.message || e);
    }
  }

  // 2) Tìm theo TỪ KHÓA/MÃ (ILIKE) — bổ sung các đoạn chứa từ khóa chính xác mà vector có thể trượt.
  try {
    const kws = extractKeywords(query).slice(0, 5);
    for (const kw of kws) {
      const safe = kw.replace(/[%_]/g, ''); // tránh ký tự đại diện của LIKE
      if (safe.length < 2) continue;
      const { data } = await client
        .from(CHUNK_TABLE)
        .select('source_id,chunk_index,content')
        .ilike('content', `%${safe}%`)
        .limit(4);
      if (Array.isArray(data)) for (const d of data) {
        const k = keyOf(d);
        if (!merged.has(k)) merged.set(k, { content: d.content, source_id: d.source_id, similarity: 0.5 });
      }
    }
  } catch (e: any) {
    console.warn('[RAG] keyword retrieve error:', e?.message || e);
  }

  // Nếu cả hai đều không trả về gì và vector cũng lỗi (emb null) -> báo null để caller fallback về full KB.
  if (merged.size === 0 && !emb) return null;
  // Ưu tiên similarity cao trước; giới hạn tổng số đoạn để kiểm soát token.
  return Array.from(merged.values())
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, matchCount + 8);
}
