# Sửa lỗi mất dữ liệu / xung đột đồng bộ (data race)

Ngày: 10/08/2026. Triệu chứng: nạp dữ liệu mới → hiển thị → một lúc sau mất → tải lại (F5) thì có lại.

## Nguyên nhân
Cơ chế lưu dùng 3 tầng (localStorage ↔ server in-memory ↔ Supabase) theo kiểu "ai ghi sau thắng", có 2 điểm yếu:
1. **Init ghi đè**: khi `/api/config/init` phản hồi chậm (server Render khởi động nguội), nó `setKnowledgeSources(server_list)` **đè** mất mục vừa thêm trong lúc chờ. Reload thì localStorage lấy lại được → đúng hiện tượng.
2. **POST cấu hình bắn quá nhiều**: mỗi tin nhắn chat cũng trigger POST `/api/config` → nhiều request bay song song, dễ đến server sai thứ tự (bản cũ đè bản mới).

## Đã sửa (client — `src/App.tsx`)
- **Init hợp nhất theo id** thay vì đè (`mergeById`): giữ nguyên mục người dùng vừa thêm dù init về sau.
- **Init chỉ chạy đúng 1 lần** (`hasInitializedRef`).
- **Tách tin nhắn chat khỏi đồng bộ cấu hình**: messages chỉ lưu localStorage, không còn bắn POST `/api/config` mỗi tin.
- **Debounce POST cấu hình 600ms**: gộp nhiều thay đổi liên tiếp thành 1 request cuối → tránh sai thứ tự ghi đè.

## Đã sửa (server — `server.ts`)
- `/api/config`: **không cho payload rỗng ghi đè** kho tri thức/sản phẩm đang có dữ liệu (chặn xóa trắng do request cũ/lỗi). Có log cảnh báo khi bỏ qua.
  - Lưu ý: nếu bạn thực sự muốn **xóa hết** tri thức/sản phẩm, hãy xóa từng mục (hoặc dùng nút xóa dữ liệu mẫu) — không xóa bằng cách gửi mảng rỗng.

## Cách kiểm tra sau khi deploy
1. Nạp một nguồn tri thức mới → chờ 30–60 giây (kể cả khi vừa mở app lúc server nguội) → mục vẫn còn, không biến mất.
2. Thêm nhiều mục liên tiếp rồi chuyển tab/chat → quay lại vẫn đủ.
3. Reload → dữ liệu khớp với những gì đang thấy (không "chờ reload mới đúng").
4. Kiểm tra Supabase (bảng `app_config`) có bản ghi mới nhất.

## Ghi chú dài hạn
Đây là bản vá làm chắc cơ chế hiện tại. Về lâu dài (Giai đoạn 2/3) nên chuyển sang **một nguồn sự thật** (Supabase/Postgres) + ghi theo từng bản ghi (per-item upsert) kèm `updated_at`, thay cho việc ghi đè cả mảng — sẽ loại bỏ hẳn lớp xung đột này.
