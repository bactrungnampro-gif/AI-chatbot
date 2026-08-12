# Hướng dẫn bật THÔNG BÁO LEAD (Bước 4)

Khi có khách để lại SĐT (tự bắt trong chat hoặc qua form), hệ thống sẽ tự gửi thông báo cho bạn.
Có 3 kênh — bật kênh nào thì thêm biến môi trường (Environment Variables) tương ứng vào nơi deploy
(Render / Railway / Vercel / VPS...). **Không cần cài thêm thư viện.** Có thể bật nhiều kênh cùng lúc.

---

## Kênh 1 — TELEGRAM (dễ nhất, khuyên dùng, miễn phí)

1. Mở Telegram, tìm **@BotFather** → gõ `/newbot` → đặt tên → nhận **BOT TOKEN**
   (dạng `123456789:AAxxxxxxxxxxxxxxxxx`).
2. Tạo 1 group (hoặc chat riêng), thêm bot vừa tạo vào.
3. Lấy **CHAT ID**: nhắn 1 tin bất kỳ trong group, rồi mở trình duyệt vào:
   `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
   → tìm `"chat":{"id": ... }` (group thường là số âm, ví dụ `-1001234567890`).
4. Thêm 2 biến môi trường:

```
TELEGRAM_BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=-1001234567890
```

---

## Kênh 2 — WEBHOOK (cho Zalo OA / n8n / Make / Slack ...)

Hệ thống sẽ POST JSON tới URL của bạn: `{ type:"new_lead", text, lead:{ phone, name, source, note, sessionId } }`.
Dùng khi bạn muốn nối vào quy trình tự động (n8n, Make, Zapier) hoặc gửi vào kênh Slack/Zalo.

```
LEAD_WEBHOOK_URL=https://webhook-cua-ban.example.com/lead
```

---

## Kênh 3 — EMAIL (qua Resend)

1. Đăng ký tài khoản tại resend.com → tạo **API Key**.
2. Xác thực tên miền gửi (hoặc dùng địa chỉ mà Resend cho phép gửi thử).
3. Thêm 3 biến:

```
RESEND_API_KEY=re_xxxxxxxxxxxx
LEAD_NOTIFY_EMAIL_TO=ban@congty.com          (có thể nhiều email, cách nhau dấu phẩy)
LEAD_NOTIFY_EMAIL_FROM=lead@tenmien-cua-ban.com
```

---

## Lưu ý

- Không bật kênh nào (thiếu biến) → hệ thống bỏ qua, KHÔNG lỗi.
- Thông báo là "bắn-và-quên": nếu kênh gửi lỗi, khách vẫn nhận trả lời bình thường, lỗi chỉ ghi vào log server (`[LeadNotify] ...`).
- Chỉ gửi khi lead MỚI thật sự (đã chống trùng theo số điện thoại trong 30 ngày).
- Sau khi thêm biến môi trường, nhớ **redeploy / restart** để máy chủ nạp biến mới.
