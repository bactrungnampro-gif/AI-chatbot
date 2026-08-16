# RÀ SOÁT HỆ THỐNG — CÁC HẠNG MỤC CÒN CÓ THỂ NÂNG CẤP

Rà soát trên mã nguồn đang chạy (bản mới nhất trên máy, đã gồm live chat).

---

## 🔴 NHÓM A — BẢO MẬT & RIÊNG TƯ (cấp bách, làm trước)

### A1. Toàn bộ endpoint quản trị đang MỞ CÔNG KHAI ⚠️ NGHIÊM TRỌNG

**Đã xác minh trong mã:**
- `src/server/config/env.ts`: `AUTH_ENABLED = process.env.AUTH_ENABLED === 'true'` — mặc định/`.env.example` là `false`
- `src/server/middleware/auth.ts` dòng 41: `if (!AUTH_ENABLED) return next();` → bỏ qua toàn bộ kiểm tra
- Các endpoint `/api/admin/*` **không tự kiểm tra quyền**

**Hậu quả:** bất kỳ ai biết địa chỉ website đều có thể:

| Gọi | Lấy được |
|---|---|
| `GET /api/admin/leads` | **Toàn bộ tên + số điện thoại khách hàng** |
| `GET /api/admin/conversations` + `/api/admin/conversation?session=` | **Đọc toàn bộ nội dung khách chat** |
| `POST /api/admin/reply` | **Giả danh nhân viên nhắn tin cho khách** |
| `POST /api/admin/lead-status` / `gap-status` / `session-mode` | Sửa/phá dữ liệu |

> Trước đây các endpoint quản trị chỉ chứa cấu hình nên rủi ro thấp. Từ khi có lõi bán hàng
> (lead, hội thoại, live chat), chúng chứa **dữ liệu cá nhân khách hàng** → mức rủi ro đã đổi hoàn toàn.

**Cách xử lý:** đặt biến môi trường rồi restart:
```
AUTH_ENABLED=true
ADMIN_EMAILS=email-quan-tri-cua-ban@gmail.com
```
(Hệ đã "fail-closed": bật AUTH mà quên `ADMIN_EMAILS` thì chặn hết, không mở nhầm.)

### A2. Supabase RLS chưa bật
Các bảng `leads`, `chat_logs`, `answer_gaps`… chưa bật Row Level Security. Server dùng service-role key nên
không bị ảnh hưởng, nhưng nếu anon key lộ ra thì đọc được dữ liệu. Phần bật RLS đã có sẵn (ghi chú) trong `STEP3_SALES_CORE.sql`.

### A3. Chưa giới hạn tần suất cho endpoint công khai
`/api/feedback`, `/api/lead`, `/api/poll` chưa có giới hạn số lần gọi. Có thể bị spam làm phình DB.
(`/api/chat` đã có `CHAT_DAILY_MAX`, `/api/handoff` đã có chống spam 10 phút/phiên.)

---

## 🟡 NHÓM B — HOÀN THIỆN LIVE CHAT (vừa xây, còn thiếu)

### B1. Nhân viên KHÔNG được báo khi khách nhắn ⭐ quan trọng nhất nhóm này
Hiện nhân viên phải **ngồi canh tab quản trị** mới biết khách trả lời. Nên: khi phiên đang ở chế độ
nhân viên mà khách gửi tin → **báo Telegram ngay**.

### B2. Quên tắt chế độ nhân viên → khách bị bỏ rơi
Nếu nhân viên bật "nhân viên phụ trách" rồi quên tắt, **AI im lặng vĩnh viễn** với khách đó.
Nên: tự trả quyền lại cho AI sau ~15–30 phút không có tin nhân viên.

### B3. Thiếu tín hiệu tương tác
Chưa có "khách đang gõ", chưa có đánh dấu tin chưa đọc, chưa có âm báo khi có tin mới.

---

## 🟢 NHÓM C — DỮ LIỆU & VẬN HÀNH

### C1. `chat_logs` phình vô hạn
Mỗi lượt chat ghi 2 dòng, không bao giờ xoá. Sau vài tháng sẽ nặng và chậm.
Nên có cơ chế dọn/lưu trữ (vd xoá log cũ hơn 6–12 tháng).

### C2. Chưa xuất được danh sách lead
Chưa có nút xuất Excel/CSV để đưa lead sang phần mềm bán hàng hoặc chia cho nhân viên.

### C3. `npm run build` KHÔNG kiểm tra kiểu dữ liệu
`build` = `vite build` + `esbuild` — cả hai chỉ **xoá** kiểu, không kiểm tra. Có sẵn script `npm run lint`
(`tsc --noEmit`) nhưng không nằm trong build → lỗi kiểu lọt lưới tới production.
**Nên chạy `npm run lint` trước mỗi lần deploy.**

---

## 🔵 NHÓM D — TĂNG DOANH SỐ

### D1. Chăm sóc lead tự động
Sau khi khách để lại SĐT, tự gửi tin cảm ơn/báo giá (qua Zalo/email), nhắc lại sau 1–2 ngày nếu chưa liên hệ được.

### D2. Đa kênh — Zalo OA / Facebook Messenger
Để agent trả lời cả khi khách nhắn qua Zalo/Fanpage, không chỉ trên website.
**Đây có thể là kênh ra đơn lớn nhất ở Việt Nam.** Công sức tích hợp cao hơn các mục khác.

### D3. Nhận diện khách quay lại
Khách từng để SĐT, lần sau quay lại thì agent chào đúng tên và nhớ nhu cầu cũ.

### D4. Thống kê sâu hơn
Xếp hạng sản phẩm được hỏi nhiều nhất, câu hỏi phổ biến nhất, tỉ lệ chốt theo nhân viên.

---

## ĐỀ XUẤT THỨ TỰ

1. **A1** — bật `AUTH_ENABLED` + `ADMIN_EMAILS` (chỉ đặt biến môi trường, ~2 phút, chặn rò rỉ dữ liệu khách)
2. **B1 + B2** — hoàn thiện live chat cho dùng được thật (báo Telegram + tự trả quyền cho AI)
3. **A2, A3, C1** — siết bảo mật & dọn dữ liệu
4. **C2, D1** — xuất lead + chăm sóc tự động
5. **D2** — đa kênh Zalo/Facebook (dự án riêng, lớn hơn)
