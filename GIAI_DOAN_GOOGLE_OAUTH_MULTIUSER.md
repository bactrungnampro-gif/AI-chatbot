# Tách phiên Google OAuth theo người dùng (SEC-04)

Ngày: 10/08/2026. Khắc phục: token Google trước đây lưu trong **một biến toàn cục dùng chung** cho mọi người → nay lưu **theo từng người dùng** đã đăng nhập.

> Đã kiểm tra cú pháp TypeScript + kiểm thử logic ký `state`. **Chưa chạy end-to-end**.

## Cơ chế mới
- Token Google lưu trong map `serverGoogleSessions[userKey]`, với `userKey = "u:<supabase_user_id>"` (hoặc `"default"` khi tắt auth).
- Route khởi tạo `/api/auth/google` (được bảo vệ) tạo tham số **`state` có ký HMAC** mang `userKey`, hết hạn 10 phút.
- Callback `/api/auth/google/callback` (công khai vì Google redirect) xác minh `state` → lấy đúng `userKey` → lưu token cho người đó. Khi bật auth mà `state` sai/hết hạn → từ chối.
- `/api/auth/google/me`, `/logout`, `/api/google/drive/*` dùng token theo người đăng nhập (`googleUserKey(req)`); refresh token cũng theo từng người.
- **Đăng xuất** chỉ ngắt phiên Google của người hiện tại (không ảnh hưởng người khác).

## Thay đổi kỹ thuật khác
- `getValidGoogleAccessToken(userKey)` nhận tham số userKey.
- Persistence: lưu `googleSessions` (map) trong server_store/Firestore/Supabase; **tự migrate** dữ liệu `googleSession` (đơn) cũ sang `default`.
- Thêm **token nội bộ** (`x-internal-token`) cho các self-call server→server (resync tự gọi `/api/knowledge/scrape` & `/api/knowledge/fetch-api-endpoint`) để không bị guard chặn khi bật auth.
- Frontend `handleConnectGoogleOAuth`: lấy `authUrl` qua `fetch('/api/auth/google?format=json')` (đính kèm token) rồi mới mở popup — để `state` gắn đúng người dùng (thay vì mở URL trực tiếp).

## File thay đổi
- `server.ts`
- `src/components/KnowledgeManager.tsx`

## (Tùy chọn) Biến môi trường
- `OAUTH_STATE_SECRET`: bí mật ký `state`. Nếu không đặt, server tự sinh ngẫu nhiên mỗi lần khởi động (luồng đang dở khi restart sẽ phải kết nối lại). Nên đặt cố định ở production.

## Cách kiểm tra
1. Bật auth, đăng nhập user A → Kết nối Google → import Drive OK; kiểm tra chỉ thấy Drive của A.
2. Đăng nhập user B (trình duyệt khác) → chưa kết nối Google thì `/api/auth/google/me` trả `connected:false` (không thấy phiên của A).
3. User A "Ngắt kết nối Google" → chỉ A bị ngắt, B không ảnh hưởng.
4. Resync nguồn website/API vẫn hoạt động khi auth bật (nhờ token nội bộ).
5. Với `AUTH_ENABLED=false`: hoạt động như cũ (khóa `default`).

## Còn lại
- Listener `postMessage` phía client vẫn nên kiểm tra `e.origin` (SEC-10) — đề xuất làm ở đợt dọn nhỏ.
- `serverGoogleSessions` hiện lưu trong bộ nhớ + file/Supabase; khi mở rộng nhiều instance nên chuyển sang store phiên tập trung (Redis) và cân nhắc mã hóa refresh token.
