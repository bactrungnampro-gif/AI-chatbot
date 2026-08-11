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

export interface IndexResult { sources: number; chunks: number; skipped: number; already: number; done: boolean; error?: string; }

// Xây dựng/cập nhật chỉ mục vector — KIỂU RESUMABLE:
// chỉ embed những đoạn CHƯA có trong bảng, nên bấm lại nhiều lần sẽ CỘNG DỒN cho tới khi xong.
// maxChunks: số đoạn MỚI tối đa xử lý trong MỘT lần chạy (kiểm soát thời gian/hạn ngạch). done=true nếu đã phủ hết.
export async function indexKnowledge(
  client: any,
  ai: any,
  sources: any[],
  maxChunks = 3000,
  onProgress?: (chunks: number, sources: number) => void,
  concurrency = 3
): Promise<IndexResult> {
  const active = (Array.isArray(sources) ? sources : []).filter((s) => s && s.active !== false && s.content);
  let newlyIndexed = 0;
  let indexedSources = 0;
  let skipped = 0;
  let already = 0;
  let capReached = false;

  // Lấy tập id chunk ĐÃ CÓ để bỏ qua (resumable).
  const existingIds = new Set<string>();
  try {
    const { data: existing } = await client.from(CHUNK_TABLE).select('id');
    for (const r of (existing || [])) if (r?.id) existingIds.add(r.id);
  } catch (e: any) {
    return { sources: 0, chunks: 0, skipped: 0, already: 0, done: false, error: 'Không đọc được chỉ mục hiện có: ' + (e?.message || e) };
  }

  for (const s of active) {
    const chunks = chunkText(s.content);
    if (!chunks.length) continue;

    // Chỉ những chunk chưa có trong bảng
    const pending: { id: string; idx: number; text: string }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const id = `${s.id}_${i}`;
      if (existingIds.has(id)) { already++; continue; }
      pending.push({ id, idx: i, text: chunks[i] });
    }
    if (!pending.length) continue;

    let sourceHadNew = false;
    const rows: any[] = [];
    for (let i = 0; i < pending.length; i += concurrency) {
      if (newlyIndexed >= maxChunks) { capReached = true; break; }
      const batch = pending.slice(i, i + concurrency);
      const embs = await Promise.all(batch.map((c) => embedText(ai, c.text)));
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
      // Ghi dần theo lô nhỏ để không mất tiến độ nếu gián đoạn
      if (rows.length >= 20) {
        const { error } = await client.from(CHUNK_TABLE).upsert(rows.splice(0, rows.length), { onConflict: 'id' });
        if (error) return { sources: indexedSources, chunks: newlyIndexed, skipped, already, done: false, error: error.message };
      }
      if (onProgress) onProgress(newlyIndexed, indexedSources);
      await sleep(200); // giãn cách tránh vượt rate limit
      if (capReached) break;
    }
    if (rows.length) {
      const { error } = await client.from(CHUNK_TABLE).upsert(rows, { onConflict: 'id' });
      if (error) return { sources: indexedSources, chunks: newlyIndexed, skipped, already, done: false, error: error.message };
    }
    if (sourceHadNew) indexedSources++;
    if (onProgress) onProgress(newlyIndexed, indexedSources);
    if (capReached) break;
  }

  // done nếu không chạm cap và không còn đoạn nào bị lỗi bỏ qua (nghĩa là đã phủ hết những gì embed được)
  const done = !capReached;
  return { sources: indexedSources, chunks: newlyIndexed, skipped, already, done };
}

// Chữ ký nội dung 1 nguồn để phát hiện thay đổi (rẻ tiền).
export function sourceContentSig(s: any): string {
  const c = s?.content || '';
  return `${c.length}:${s?.title || ''}:${s?.active !== false ? 1 : 0}`;
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
export function extractKeywords(q: string): string[] {
  const raw = (q || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  // giữ token >=3 ký tự hoặc có chữ số (bắt mã ngắn: "SDS", "SKU", "102"); loại stopword.
  const words = raw.filter((w) => (w.length >= 3 || /\d/.test(w)) && !VI_STOP.has(w));
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
