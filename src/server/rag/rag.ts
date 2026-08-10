// [PoC RAG] Retrieval-Augmented Generation dùng pgvector (Supabase) + embeddings Gemini.
// Mục tiêu: thay vì nhồi toàn bộ tri thức vào prompt, chỉ truy hồi các đoạn liên quan nhất -> giảm token/chi phí, tăng độ chính xác.

// Model embedding hiện hành của Gemini (text-embedding-004 đã bị gỡ khỏi v1beta embedContent).
// gemini-embedding-001 mặc định 3072 chiều nhưng hỗ trợ outputDimensionality -> ép 768 để khớp bảng vector(768).
export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIM = 768;
export const CHUNK_TABLE = 'kb_chunks';

// Chia nhỏ văn bản thành các đoạn ~1200 ký tự, chồng lấn 150 ký tự để giữ ngữ cảnh.
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
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

// Tạo embedding cho 1 đoạn văn bản. Trả về mảng số (đã chuẩn hóa, EMBED_DIM chiều) hoặc null nếu lỗi.
export async function embedText(ai: any, text: string): Promise<number[] | null> {
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
    // Nếu model trả nhiều hơn EMBED_DIM (Matryoshka), cắt xuống EMBED_DIM.
    if (v.length > EMBED_DIM) v = v.slice(0, EMBED_DIM);
    if (v.length !== EMBED_DIM) return null; // không khớp số chiều bảng -> bỏ qua để tránh lỗi ghi
    // Chuẩn hóa về vector đơn vị (khuyến nghị khi cắt bớt chiều MRL).
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return v.map((x: number) => x / norm);
  } catch (e: any) {
    console.warn('[RAG] embed error:', e?.message || e);
    return null;
  }
}

export interface IndexResult { sources: number; chunks: number; skipped: number; error?: string; }

// Xây dựng/cập nhật chỉ mục vector cho các nguồn tri thức đang bật.
// maxChunks: giới hạn tổng số đoạn cho PoC để kiểm soát chi phí/thời gian.
export async function indexKnowledge(
  client: any,
  ai: any,
  sources: any[],
  maxChunks = 400,
  onProgress?: (chunks: number, sources: number) => void,
  concurrency = 5
): Promise<IndexResult> {
  const active = (Array.isArray(sources) ? sources : []).filter((s) => s && s.active !== false && s.content);
  let totalChunks = 0;
  let indexedSources = 0;
  let skipped = 0;

  for (const s of active) {
    if (totalChunks >= maxChunks) { skipped++; continue; }
    const chunks = chunkText(s.content);
    if (!chunks.length) { skipped++; continue; }

    // Xóa chunk cũ của nguồn này trước khi ghi mới
    try {
      await client.from(CHUNK_TABLE).delete().eq('source_id', s.id);
    } catch (e: any) {
      return { sources: indexedSources, chunks: totalChunks, skipped, error: 'Không xóa được chunk cũ: ' + (e?.message || e) };
    }

    const rows: any[] = [];
    // Tạo embedding SONG SONG theo lô để nhanh hơn (thay vì tuần tự từng đoạn).
    for (let i = 0; i < chunks.length; i += concurrency) {
      if (totalChunks >= maxChunks) break;
      const batch = chunks.slice(i, i + concurrency);
      const embs = await Promise.all(batch.map((c) => embedText(ai, c)));
      for (let j = 0; j < batch.length; j++) {
        if (totalChunks >= maxChunks) { skipped++; continue; }
        const emb = embs[j];
        if (!emb) { skipped++; continue; }
        rows.push({
          id: `${s.id}_${i + j}`,
          source_id: s.id,
          chunk_index: i + j,
          content: batch[j],
          embedding: emb,
          updated_at: new Date().toISOString(),
        });
        totalChunks++;
      }
      if (onProgress) onProgress(totalChunks, indexedSources);
    }

    // Ghi theo lô để tránh statement timeout
    for (let i = 0; i < rows.length; i += 20) {
      const { error } = await client.from(CHUNK_TABLE).upsert(rows.slice(i, i + 20), { onConflict: 'id' });
      if (error) return { sources: indexedSources, chunks: totalChunks, skipped, error: error.message };
    }
    if (rows.length) indexedSources++;
    if (onProgress) onProgress(totalChunks, indexedSources);
  }

  return { sources: indexedSources, chunks: totalChunks, skipped };
}

// Truy hồi các đoạn liên quan nhất tới câu hỏi. Trả về mảng { content, source_id, similarity } hoặc null.
export async function retrieveRelevant(
  client: any,
  ai: any,
  query: string,
  matchCount = 6
): Promise<Array<{ content: string; source_id: string; similarity: number }> | null> {
  if (!query || !query.trim()) return null;
  const emb = await embedText(ai, query);
  if (!emb) return null;
  try {
    const { data, error } = await client.rpc('match_kb_chunks', {
      query_embedding: emb,
      match_count: matchCount,
    });
    if (error) {
      console.warn('[RAG] match rpc error:', error.message);
      return null;
    }
    return Array.isArray(data) ? data : [];
  } catch (e: any) {
    console.warn('[RAG] retrieve error:', e?.message || e);
    return null;
  }
}
