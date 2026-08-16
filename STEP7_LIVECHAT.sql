-- =====================================================================
--  NÂNG CẤP — LIVE CHAT (nhân viên chat trực tiếp với khách trong widget)
--  Tạo bảng chat_sessions: đánh dấu phiên nào đang do NHÂN VIÊN tiếp nhận (AI tạm ngừng trả lời).
--  Tin nhắn của nhân viên dùng chung bảng chat_logs sẵn có (sender = 'staff') -> không cần bảng mới.
--  Chạy 1 lần trong Supabase → SQL Editor → New query → Run. An toàn chạy lại (IF NOT EXISTS).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  session_id  TEXT        PRIMARY KEY,
  human_mode  BOOLEAN     NOT NULL DEFAULT false,  -- true = nhân viên đang phụ trách, AI ngừng trả lời
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tra nhanh các phiên đang được nhân viên tiếp nhận.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_human
  ON public.chat_sessions (human_mode);

-- Widget hỏi tin mới theo id tăng dần -> cần index (session_id, id) cho nhanh.
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id_seq
  ON public.chat_logs (session_id, id);
