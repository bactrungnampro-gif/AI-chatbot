-- =====================================================================
--  TỐI ƯU HIỆU NĂNG — BỔ SUNG INDEX CHO CÁC TRUY VẤN NÓNG
--
--  Vì sao cần: khi bảng chat_logs lớn dần (mỗi lượt chat ghi 2 dòng), các truy vấn dưới đây
--  sẽ phải quét TOÀN BỘ bảng nếu thiếu index -> chậm dần rồi treo.
--
--  Dùng CONCURRENTLY để KHÔNG khoá bảng — website vẫn chạy bình thường trong lúc tạo index.
--  ⚠️ LƯU Ý: câu lệnh CONCURRENTLY không chạy được trong transaction.
--     Trong Supabase SQL Editor, hãy chạy TỪNG CÂU MỘT (bôi đen 1 câu rồi Run).
--     Nếu báo lỗi transaction, bỏ chữ CONCURRENTLY (bảng nhỏ thì khoá cũng chỉ vài giây).
-- =====================================================================

-- 1) Truy vấn NÓNG NHẤT: widget hỏi tin nhân viên mỗi 5 giây
--    WHERE session_id = ? AND sender = 'staff' AND id > ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_logs_session_staff
  ON public.chat_logs (session_id, id)
  WHERE sender = 'staff';

-- 2) Mở một hội thoại + lấy mốc id mới nhất của phiên
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_logs_session_id_seq
  ON public.chat_logs (session_id, id);

-- 3) Dashboard + dọn dữ liệu cũ (lọc theo thời gian)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_logs_created
  ON public.chat_logs (created_at);

-- 4) Nhắc lead chưa liên hệ: WHERE status='new' AND created_at < ? AND reminded_at IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status_created
  ON public.leads (status, created_at);

-- 5) Chống trùng lead theo số điện thoại
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_phone
  ON public.leads (phone);

-- 6) Đánh dấu phiên "đang chờ nhân viên" trong danh sách hội thoại
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_source_status
  ON public.leads (source, status);


-- =====================================================================
--  (TÙY CHỌN) Tăng tốc tìm kiếm từ khoá trong kho tri thức RAG.
--  Bỏ qua nếu bạn chưa dùng RAG hoặc kho tri thức còn nhỏ.
-- =====================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_chunks_content_trgm
--   ON public.kb_chunks USING GIN (content gin_trgm_ops);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_chunks_source
--   ON public.kb_chunks (source_id, chunk_index);


-- =====================================================================
--  KIỂM TRA SAU KHI CHẠY: liệt kê index đang có
-- =====================================================================
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('chat_logs', 'leads', 'chat_sessions', 'kb_chunks')
ORDER BY tablename, indexname;
