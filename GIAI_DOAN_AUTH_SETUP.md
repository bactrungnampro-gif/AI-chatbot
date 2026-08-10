# Xác thực quản trị — Supabase Auth (hướng dẫn thiết lập)

Ngày: 10/08/2026. Cơ chế: **Supabase Auth (email/mật khẩu)**. Backend xác thực JWT và chặn mọi endpoint quản trị/ghi; frontend có màn hình đăng nhập và tự đính kèm token.

> Đã kiểm tra cú pháp TypeScript. **Chưa chạy end-to-end** — làm theo các bước dưới rồi test.

---

## 1. Thiết lập (bắt buộc để bật auth)

1. **Bảng điều khiển Supabase → Authentication → Providers**: bật **Email**. Nên **tắt "Allow new users to sign up"** (chỉ admin tạo tài khoản).
2. **Authentication → Users → Add user**: tạo tài khoản admin (email + mật khẩu).
3. Thêm vào tệp `.env` của server:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...            # anon/publishable key (KHÔNG dùng service role)
AUTH_ENABLED=true
ADMIN_EMAILS=admin@doanhnghiep.com  # danh sách email được phép (phân tách dấu phẩy); để trống = mọi user Supabase hợp lệ
```

4. Khởi động lại server.

Khi `AUTH_ENABLED=false` (mặc định), app chạy như cũ (không đăng nhập) — tiện cho môi trường dev.

---

## 2. Cách hoạt động

- **Frontend** gọi `GET /api/public-config` để lấy `supabaseUrl` + `supabaseAnonKey` (anon key là khóa công khai, an toàn) và cờ `authEnabled`.
- Nếu bật auth và chưa đăng nhập → hiện **màn hình đăng nhập** (`LoginScreen`). Đăng nhập qua `supabase.auth.signInWithPassword`.
- Sau khi đăng nhập, một **fetch interceptor** tự gắn `Authorization: Bearer <JWT>` vào mọi request `/api/...` (không phải sửa từng component).
- **Backend** (`server.ts`) có middleware chặn mọi endpoint không công khai khi `AUTH_ENABLED=true`: kiểm tra JWT bằng `supabase.auth.getUser(token)`, và (nếu đặt `ADMIN_EMAILS`) kiểm tra email nằm trong danh sách.

### Endpoint công khai (không cần đăng nhập)
`GET /api/health`, `GET /api/public-config`, `GET /api/widget.js`, `POST /api/chat`, `GET /api/config` (widget đọc), `GET /api/auth/google/callback`.

### Endpoint được bảo vệ (cần đăng nhập)
Tất cả còn lại: `POST /api/config`, `/api/config/init`, `/api/knowledge/*`, `/api/supabase/*`, `/api/google/*` (trừ callback), `/api/firecrawl/test`, `/api/export-docx`, ...

---

## 3. File thay đổi / thêm mới

- `server.ts` — thêm middleware auth (`AUTH_ENABLED`, `ADMIN_EMAILS`, `verifySupabaseToken`, guard theo `isPublicApi`) và endpoint `GET /api/public-config`.
- `src/lib/auth.ts` *(mới)* — Supabase client phía client, fetch interceptor, `initAuth/signIn/signOut/getSession/onAuthChange`.
- `src/components/LoginScreen.tsx` *(mới)* — màn hình đăng nhập.
- `src/App.tsx` — khởi tạo auth, gate UI quản trị sau đăng nhập, nút "Đăng xuất"; chỉ tải cấu hình khi đủ điều kiện xác thực.
- `.env.example` — thêm `AUTH_ENABLED`, `ADMIN_EMAILS`.

---

## 4. Cách kiểm tra

1. Đặt `AUTH_ENABLED=true` + Supabase env + tạo user admin. Chạy `bun run dev`.
2. Mở app → thấy **màn hình đăng nhập**. Đăng nhập sai → báo lỗi; đúng → vào được trang quản trị.
3. Chưa đăng nhập, gọi thử `POST /api/config` (vd bằng curl không kèm token) → trả **401**.
4. Có đăng nhập → lưu cấu hình/crawl hoạt động bình thường (token tự đính kèm).
5. Đặt `ADMIN_EMAILS` khác email đăng nhập → đăng nhập user đó phải bị **403** ở các endpoint quản trị.
6. **Widget nhúng** (`?mode=widget`) vẫn chat được mà không cần đăng nhập.
7. Đặt lại `AUTH_ENABLED=false` → app chạy như cũ.

---

## 5. Ghi chú & việc còn lại

- Đây là auth **single-tenant** (một nhóm admin dùng chung cấu hình toàn cục). Khi lên đa-tenant (Giai đoạn 4) cần gắn dữ liệu theo từng user/tenant.
- Phiên **Google OAuth** vẫn dùng chung toàn cục (SEC-04) — nên tách theo người dùng ở đợt sau.
- Nên bật **HTTPS** ở production để cookie/token an toàn; cân nhắc thêm rate-limit cho `/api/auth`/`/api/chat`.
- Việc xác thực token gọi `supabase.auth.getUser` mỗi request; nếu cần tối ưu, sau này có thể xác minh JWT cục bộ bằng JWT secret.
