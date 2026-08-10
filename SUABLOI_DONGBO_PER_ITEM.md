# Đồng bộ theo từng bản ghi (per-item upsert) — giải pháp triệt để

Ngày: 10/08/2026. Thay việc ghi lại TOÀN BỘ dữ liệu mỗi lần lưu bằng **chỉ ghi mục thay đổi/mới + xóa mục đã gỡ**.

## Trước & sau
- **Trước:** mỗi lần lưu, server upsert lại tất cả knowledge (kèm content) → nặng, dễ "statement timeout", ghi thừa.
- **Sau:** server so sánh (diff) trạng thái hiện tại với lần đồng bộ trước qua "chữ ký" nhẹ, rồi:
  - **Upsert** chỉ những mục MỚI hoặc THAY ĐỔI (theo lô 20).
  - **Xóa** những mục đã bị gỡ (theo lô 50).
  - `app_config` vẫn chỉ lưu metadata (không content) như bản trước.

## Chi tiết kỹ thuật (server.ts)
- `ksSignature(s)`: chữ ký rẻ tiền (title|url|active|độ dài content|wordCount|type) để phát hiện thay đổi mà không phải hash toàn bộ content.
- `syncKnowledgeSourcesDiff(client, table, sources, force?)`: tính upsert/delete theo diff; `force=true` ghi lại tất cả (dùng cho nút "Đồng bộ" thủ công).
- `primeKnowledgeSyncSig(sources)`: sau khi tải từ Supabase lúc khởi động, nạp sẵn chữ ký → lần lưu đầu không ghi lại thừa.
- Auto-save (`/api/config` → `saveStoreToSupabase`) dùng diff (chỉ phần thay đổi).
- Nút "Đồng bộ" (`/api/supabase/sync`) dùng `force=true` để ghi lại toàn bộ.

## Lợi ích
- Hết "statement timeout" ngay cả khi kho tri thức lớn.
- Mỗi thao tác (thêm 1 nguồn, sửa 1 nguồn, xóa 1 nguồn) chỉ tạo 1 lệnh ghi nhỏ tương ứng.
- Giảm mạnh lưu lượng ghi Supabase.

## Lưu ý
- Chữ ký lưu trong bộ nhớ server; sau khi server khởi động lại, lần lưu đầu có thể ghi lại toàn bộ một lần (đã được prime từ dữ liệu tải về nên thường không xảy ra). An toàn.
- Vẫn giữ "chặn payload rỗng xóa trắng" ở `/api/config`. Muốn xóa hết thì xóa từng mục.

## Kiểm tra sau deploy
1. Thêm 1 nguồn tri thức → log server: `KB diff sync: upsert 1, delete 0`.
2. Sửa 1 nguồn → `upsert 1`.
3. Xóa 1 nguồn → `delete 1`.
4. Đổi cài đặt agent (không đụng tri thức) → `upsert 0, delete 0` (không ghi thừa bảng tri thức).
5. Không còn lỗi "statement timeout".
