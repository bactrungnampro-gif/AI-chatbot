# PoC RAG — Truy hồi ngữ nghĩa để tối ưu chi phí AI

Ngày: 10/08/2026. Thay vì nhồi TOÀN BỘ tri thức vào prompt (giới hạn 24.000 ký tự, mỗi nguồn cắt 6.000), RAG chỉ đưa **các đoạn liên quan nhất** tới câu hỏi vào prompt.

> Đây là **PoC**, mặc định TẮT (`RAG_ENABLED=false`) để không ảnh hưởng hoạt động hiện tại. Có **fallback**: nếu RAG lỗi/chưa có chỉ mục, chat tự quay về cách cũ.

## Lợi ích
- Giảm mạnh token gửi lên model mỗi lượt chat → **giảm chi phí**, nhanh hơn.
- Không bị cắt cụt tri thức (6.000/24.000 ký tự) → **chính xác hơn** với kho lớn.

## Cách hoạt động
1. **Lập chỉ mục** (`POST /api/rag/index`): chia nhỏ nội dung mỗi nguồn → tạo embedding (Gemini `text-embedding-004`, 768 chiều) → lưu vào bảng `kb_chunks` (pgvector) trên Supabase.
2. **Khi chat**: embedding câu hỏi → gọi hàm `match_kb_chunks` lấy top-6 đoạn gần nhất → chỉ đưa các đoạn đó vào prompt.

## Thiết lập (làm 1 lần)

### Bước 1 — Chạy SQL trên Supabase (SQL Editor)
```sql
-- Bật pgvector
create extension if not exists vector;

-- Bảng lưu các đoạn + vector embedding (768 chiều cho text-embedding-004)
create table if not exists public.kb_chunks (
  id text primary key,
  source_id text,
  chunk_index int,
  content text,
  embedding vector(768),
  updated_at timestamptz default now()
);

-- Index ANN theo cosine để truy vấn nhanh
create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Hàm truy hồi top-N đoạn gần nhất
create or replace function public.match_kb_chunks(query_embedding vector(768), match_count int)
returns table (id text, source_id text, content text, similarity float)
language sql stable as $$
  select id, source_id, content, 1 - (embedding <=> query_embedding) as similarity
  from public.kb_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- (Nếu bật RLS) máy chủ dùng service_role sẽ bỏ qua RLS. Nếu để UNRESTRICTED thì không cần thêm gì.
```

### Bước 2 — Bật biến môi trường trên Render
```
RAG_ENABLED=true
```
(cần sẵn `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` hoặc `SUPABASE_ANON_KEY`, và `GEMINI_API_KEY`)

### Bước 3 — Xây chỉ mục lần đầu
Sau khi đã nạp tri thức, gọi API lập chỉ mục. Đơn giản nhất: mở web app → F12 (DevTools) → tab Console → dán:
```js
fetch('/api/rag/index', { method: 'POST' }).then(r => r.json()).then(console.log)
```
Kết quả kỳ vọng: `{ success: true, message: "✅ Đã lập chỉ mục N đoạn từ M nguồn..." }`.
Kiểm tra trạng thái bất kỳ lúc nào:
```js
fetch('/api/rag/status').then(r => r.json()).then(console.log)
```

> Lưu ý: mỗi lần thêm/sửa nguồn tri thức, cần chạy lại `/api/rag/index` để cập nhật chỉ mục (PoC làm thủ công; bước sau có thể tự động hóa hoặc thêm nút trong giao diện).

## Kiểm tra hiệu quả
- Sau khi bật RAG + lập chỉ mục, hỏi agent một câu liên quan tới tài liệu đã nạp → log server hiện `[RAG] Dùng 6 đoạn truy hồi...`.
- So sánh độ dài prompt/chi phí trước–sau (RAG gửi ~vài nghìn ký tự thay vì tối đa 24.000).

## Giới hạn của PoC (có thể nâng cấp sau)
- Lập chỉ mục thủ công (chưa tự động khi tri thức đổi) — có thể thêm nút UI hoặc tự động hoá.
- Giới hạn 400 đoạn/lần index để kiểm soát chi phí embedding (chỉnh trong `rag.ts` nếu cần).
- Chưa lọc theo nguồn đang bật/tắt lúc truy hồi (chỉ index nguồn active); có thể thêm filter theo `source_id`.
- Embedding tuần tự (đơn giản, an toàn) — với kho rất lớn có thể chậm; sau này batch để nhanh hơn.

## File thay đổi
- `src/server/rag/rag.ts` (mới): chunk, embed, index, retrieve.
- `server.ts`: cờ `RAG_ENABLED`; endpoint `POST /api/rag/index`, `GET /api/rag/status`; tích hợp truy hồi vào `/api/chat` (có fallback).
- `.env.example`: thêm `RAG_ENABLED`.
