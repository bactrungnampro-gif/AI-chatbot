# ✅ Checklist Go-Live — Bước 3 + Bước 4 (Lõi bán hàng)

Tất cả file mã nguồn đã được lưu vào thư mục dự án. Làm theo thứ tự dưới đây.

---

## 1) Chạy SQL trong Supabase (chỉ 1 lần, nếu CHƯA làm)

Supabase → **SQL Editor** → New query → dán nội dung file `STEP3_SALES_CORE.sql` → **Run**.
Tạo 2 bảng `chat_logs` và `leads`. (Bàn giao nhân viên dùng chung bảng `leads`, không cần SQL thêm.)
Kết quả "Success. No rows returned" là bình thường.

## 2) Thêm biến môi trường Telegram (nơi deploy: Render/Railway/VPS...)

```
TELEGRAM_BOT_TOKEN=<token_MOI_sau_khi_revoke>
TELEGRAM_CHAT_ID=5701030705
```

> Nhớ dùng **token mới** (đã /revoke token cũ bị lộ). chat_id giữ nguyên.

## 3) Deploy (PowerShell, chạy từng dòng)

```
npm run build
git add .
git commit -m "Go-live: sales core (chat log + lead + Telegram + handoff)"
git push origin main
```

Sau khi deploy: **redeploy/restart** để nạp biến môi trường mới.

---

## 4) Kiểm tra thực tế (sau khi deploy xong)

**A. Ghi log hội thoại**
- [ ] Mở widget chat trên website (chế độ khách), gõ vài câu.
- [ ] Vào app → tab **"Lead & Hội Thoại Khách"** → mục **Hội thoại** → bấm "Tải lại" → thấy phiên chat vừa tạo, bấm vào xem lại đúng nội dung.

**B. Tự bắt SĐT thành lead + báo Telegram**
- [ ] Trong widget, gõ câu có số điện thoại: ví dụ *"cho mình tư vấn nhé, sđt 0912345678"*.
- [ ] Nhận tin **"🔔 LEAD MỚI…"** trong Telegram.
- [ ] Tab quản trị → mục **Lead** → thấy lead mới với SĐT đó.

**C. Bàn giao nhân viên**
- [ ] Trong widget, bấm nút **"Gặp nhân viên tư vấn"** (biểu tượng tai nghe, trên ô nhập).
- [ ] Nhận tin **"🙋 KHÁCH CẦN GẶP NHÂN VIÊN"** trong Telegram.
- [ ] Tab quản trị → mục Lead → thấy dòng có nhãn đỏ **"🙋 Cần gặp NV"**.
- [ ] Thử gõ *"cho tôi gặp nhân viên"* (không bấm nút) → cũng phải ra thông báo tương tự.

**D. Quản lý lead**
- [ ] Trong tab quản trị, đổi trạng thái một lead (Mới → Đã gọi → Chốt đơn) → số liệu thống kê phía trên cập nhật.

---

## 5) Nếu có trục trặc

- **Không thấy dữ liệu trong tab quản trị:** kiểm tra đã chạy SQL bước 1 chưa; xem log server có dòng `[ChatLog]` / `[Lead]` báo lỗi không.
- **Không nhận được Telegram:** dán link test vào trình duyệt (thay token):
  `https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=5701030705&text=test`
  → nếu link báo lỗi thì token/chat_id chưa đúng; nếu link OK mà lead không báo thì kiểm tra biến môi trường đã nạp vào server chưa (phải restart sau khi thêm).
- **Widget không có nút "Gặp nhân viên":** xóa cache trình duyệt / tải lại trang; đảm bảo đã `npm run build` và deploy bản mới.

---

## Ghi chú
- Phần **bền vững dữ liệu** đã có sẵn (cấu hình/tri thức/lead/hội thoại đều lưu Supabase, nạp xong mới mở phục vụ) — không cần làm gì thêm.
- Phần **streaming (trả lời hiện chữ dần)** để dành làm sau khi cụm này chạy ổn với khách thật.
