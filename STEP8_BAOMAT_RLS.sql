-- =====================================================================
--  BẢO MẬT — BẬT ROW LEVEL SECURITY (RLS) CHO CÁC BẢNG DỮ LIỆU KHÁCH HÀNG
--
--  MỤC ĐÍCH: chặn mọi truy cập trực tiếp bằng ANON KEY (khoá công khai nằm trong mã frontend).
--  Nếu anon key bị lộ, người ngoài VẪN KHÔNG đọc được số điện thoại / hội thoại của khách.
--
--  AN TOÀN CHO HỆ THỐNG: máy chủ dùng SERVICE ROLE KEY — khoá này BỎ QUA RLS,
--  nên toàn bộ tính năng (lead, hội thoại, live chat, dashboard) vẫn chạy bình thường.
--
--  ĐIỀU KIỆN: máy chủ phải đang dùng SUPABASE_SERVICE_ROLE_KEY (không phải anon key).
--  Nếu đang dùng anon key thì ĐỪNG chạy file này — hãy đổi sang service role key trước.
--
--  Chạy 1 lần: Supabase → SQL Editor → New query → dán → Run. An toàn chạy lại nhiều lần.
-- =====================================================================

-- Bật RLS. Khi đã bật mà KHÔNG tạo policy nào cho anon => anon bị chặn hoàn toàn.
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_logs        ENABLE ROW LEVEL SECURITY;

-- Các bảng dưới có thể chưa tồn tại nếu bạn chưa chạy STEP5/6/7 — bọc lại để không lỗi cả file.
DO $$
BEGIN
  IF to_regclass('public.answer_gaps') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.answer_gaps ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public.answer_feedback') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.answer_feedback ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public.chat_sessions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public.app_config') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- =====================================================================
--  KIỂM TRA SAU KHI CHẠY
--  Câu lệnh dưới liệt kê trạng thái RLS của từng bảng (rowsecurity = true là đã bật).
-- =====================================================================
SELECT tablename, rowsecurity AS rls_da_bat
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('leads','chat_logs','answer_gaps','answer_feedback','chat_sessions','app_config')
ORDER BY tablename;

-- =====================================================================
--  NẾU CẦN QUAY LẠI (gỡ RLS) — bỏ ghi chú dòng tương ứng rồi chạy:
-- =====================================================================
-- ALTER TABLE public.leads            DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.chat_logs        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.answer_gaps      DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.answer_feedback  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.chat_sessions    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.app_config       DISABLE ROW LEVEL SECURITY;
