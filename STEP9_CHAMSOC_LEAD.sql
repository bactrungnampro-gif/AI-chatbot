-- =====================================================================
--  NÂNG CẤP — CHĂM SÓC LEAD TỰ ĐỘNG
--  Thêm cột `reminded_at` vào bảng leads: đánh dấu lead ĐÃ được nhắc,
--  để hệ thống không nhắc đi nhắc lại cùng một khách.
--  Chạy 1 lần: Supabase → SQL Editor → New query → Run. An toàn chạy lại (IF NOT EXISTS).
-- =====================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;

-- Tìm nhanh các lead "Mới" chưa được nhắc (đúng truy vấn hệ thống dùng).
CREATE INDEX IF NOT EXISTS idx_leads_followup
  ON public.leads (status, created_at)
  WHERE reminded_at IS NULL;

-- Kiểm tra: cột đã được thêm chưa?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'reminded_at';
