# Nhóm bảo mật còn lại (CHANGELOG)

Ngày: 10/08/2026. Bao gồm: SEC-12 (rate-limit + body limit), SEC-07/08 (Supabase về env, không tắt RLS, ngừng ghi .env runtime), SEC-10 (kiểm tra origin postMessage), ARC-04 (dọn system prompt lặp/hỏng).

> Đã kiểm tra cú pháp TypeScript. **Chưa chạy end-to-end** — vui lòng test.

## 1. SEC-12 — Rate limit & giới hạn body
- Giảm giới hạn body từ **50mb → 15mb** (cấu hình `MAX_BODY_SIZE`).
- Thêm **rate limiter trong bộ nhớ** (theo IP, fixed window), không cần thư viện ngoài:
  - `/api/chat`: mặc định **20 req/phút** (`RATE_LIMIT_CHAT_MAX`).
  - `/api/*` khác: mặc định **100 req/phút** (`RATE_LIMIT_MAX`), cửa sổ `RATE_LIMIT_WINDOW_MS` (60000ms).
  - Vượt ngưỡng → trả **429** kèm `Retry-After`. Có header `X-RateLimit-*`.
- Đã bật `trust proxy` để lấy đúng IP sau reverse proxy (Cloud Run/Nginx).
- Lưu ý: rate limit theo từng tiến trình (in-memory). Khi chạy nhiều instance nên dùng store tập trung (Redis).

## 2. SEC-07/08 — Supabase chỉ dùng env, không tắt RLS
- `getSupabaseClient()` **chỉ lấy credential từ env** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, fallback `SUPABASE_ANON_KEY`). Không còn nhận url/key từ client.
- `/api/supabase/test` & `/api/supabase/sync`: bỏ tham số url/anonKey từ body; dùng env.
- **Ngừng ghi `.env` / `supabase_config.json` lúc runtime** (`persistSupabaseEnv` thành no-op; bỏ lời gọi trong `saveServerStore` và `/api/config/init`).
- **SQL hướng dẫn: BẬT RLS** (thay vì `DISABLE ROW LEVEL SECURITY`). Máy chủ ghi bằng **Service Role Key** (bỏ qua RLS an toàn ở server), nên không cần mở quyền cho anon.
- `stripAiSecrets()` nay xóa thêm `supabaseConfig` — không lưu/không trả credential Supabase về client.
- Frontend `AgentPersonaConfig`: bỏ ô nhập Supabase URL/Key (kể cả gợi ý "Service Role Key" ở client) → thay bằng thông báo cấu hình phía server; giữ nút Kiểm tra/Đồng bộ (thao tác bằng env server).

### Cần đặt trên server (.env)
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-side, KHÔNG lộ ra client
```

## 3. SEC-10 — Kiểm tra origin postMessage
- `KnowledgeManager`: listener `message` bỏ qua sự kiện nếu `e.origin !== window.location.origin` (chống giả mạo OAuth success từ tab/iframe lạ).

## 4. ARC-04 — Dọn system prompt
- Xóa khối bị **nhân đôi + hỏng ký tự (mojibake)** trong `systemInstruction` của `/api/chat` (đoạn quy tắc hình ảnh/link bị lặp 2 lần, bản lặp còn mâu thuẫn về gửi link Google Drive). Giữ lại một khối duy nhất, sạch → giảm token & tránh nhiễu chỉ thị.

## File thay đổi
- `server.ts`, `src/components/KnowledgeManager.tsx`, `src/components/AgentPersonaConfig.tsx`, `.env.example`

## Cách kiểm tra
1. **Rate limit**: gọi `/api/chat` > 20 lần/phút từ cùng IP → nhận **429**.
2. **Body limit**: gửi payload > 15mb → bị từ chối (413).
3. **Supabase**: đặt `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, tạo bảng bằng SQL mới (RLS BẬT) → Kiểm tra kết nối & Đồng bộ hoạt động; anon key không đọc được bảng (RLS chặn).
4. **postMessage**: đăng nhập Google → vẫn nhận thông báo thành công (cùng origin); message từ origin khác bị bỏ qua.
5. **Prompt**: chat thử → agent trả lời bình thường, không còn nội dung lặp.

## Trạng thái lộ trình bảo mật (Giai đoạn 1 mở rộng — HOÀN TẤT)
Đã xử lý: SSRF, XSS, CORS, API key về backend, xác thực (Supabase Auth), tách phiên Google OAuth, rate-limit/body-limit, Supabase env-only + RLS, postMessage origin, dọn prompt.

Khuyến nghị đợt sau (không còn thuộc nhóm "bảo mật cấp bách"): chuyển sang **Giai đoạn 2 (tái cấu trúc backend)**, hoặc **PoC RAG**; cân nhắc Redis cho rate-limit/phiên khi chạy đa instance; mã hóa refresh token; xoay vòng mọi khóa đã từng commit.
