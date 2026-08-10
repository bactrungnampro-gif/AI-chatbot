# Giai đoạn 1 — Khắc phục bảo mật (CHANGELOG)

Ngày: 10/08/2026. Phạm vi: chặn SSRF, lọc XSS, siết CORS, chuyển API key về backend, ẩn bí mật khỏi git.
Quyết định đã chốt: **không làm auth đợt này**; **API key chuyển hẳn về backend (biến môi trường)**.

> Lưu ý: các thay đổi đã được kiểm tra cú pháp (TypeScript transpile) và kiểm thử logic chặn IP nội bộ. **Chưa chạy end-to-end** trên máy bạn — vui lòng test theo mục "Cách kiểm tra" bên dưới.

---

## 1. Việc bạn CẦN làm ngay sau khi cập nhật

### 1.1. Đặt API key trên server (bắt buộc)
Từ nay client không còn nhập/lưu API key. Thêm vào tệp `.env` ở thư mục gốc dự án (server):

```
GEMINI_API_KEY=...            # đã có sẵn
OPENAI_API_KEY=               # nếu dùng OpenAI
DEEPSEEK_API_KEY=             # nếu dùng DeepSeek
ANTHROPIC_API_KEY=            # nếu dùng Claude
CUSTOM_OPENAI_ENDPOINT=       # nếu dùng Ollama/LM Studio/proxy
CUSTOM_OPENAI_API_KEY=        # key cho custom endpoint (nếu có)
ALLOWED_ORIGINS=              # xem 1.2
```

### 1.2. Siết CORS ở production
Đặt `ALLOWED_ORIGINS` là danh sách origin trang quản trị, phân tách bằng dấu phẩy. Ví dụ:

```
ALLOWED_ORIGINS=https://admin.tencuaban.com,http://localhost:3000
```

Endpoint công khai cho widget (`/api/chat`, `/api/widget.js`, `/api/health`, `GET /api/config`) vẫn mở cho mọi origin để nhúng được; các endpoint ghi/quản trị chỉ nhận origin trong danh sách này. Để trống khi dev.

### 1.3. Xoay vòng (rotate) các khóa đã từng bị commit
`firebase-applet-config.json`, `server_store.json`, `supabase_config.json` nay đã vào `.gitignore`, nhưng nếu đã từng đẩy lên git thì cần:
- Xóa khỏi lịch sử git (git filter-repo/BFG) và rotate: khóa Firebase Web API, OAuth client, và khóa Supabase.

---

## 2. Danh sách thay đổi theo file

### `server.ts`
- **CORS**: bỏ `Access-Control-Allow-Origin: *` toàn cục. Chỉ mở cho endpoint công khai (widget); endpoint khác theo `ALLOWED_ORIGINS`.
- **SSRF**: thêm `isPrivateIp`, `assertSafeExternalUrl` (có phân giải DNS), `safeFetch`. Áp cho:
  - `POST /api/knowledge/scrape` (validate URL vào + sub-URL crawl qua `safeFetch`).
  - `POST /api/knowledge/fetch-api-endpoint` (validate URL trước khi gọi).
  - Chặn IP nội bộ/loopback/link-local 169.254 (cloud metadata), 10/8, 172.16/12, 192.168/16, CGNAT, IPv6 ULA/loopback.
- **API key về backend**: `/api/chat` chỉ dùng key & endpoint từ env; bỏ qua `customApiKey`/`customApiEndpoint`/`providerApiKeys` do client gửi. Firecrawl (`/api/firecrawl/test`, `/api/knowledge/scrape`) chỉ dùng `FIRECRAWL_API_KEY` từ env.
- **Config store**: thêm `stripAiSecrets()` — không lưu và không trả về key ở `GET/POST /api/config` và `/api/config/init`.
- **XSS OAuth callback**: thêm `escapeHtml()` + `jsonForScript()`; escape mọi biến (`error`, `userInfo.email/picture`); `postMessage` đổi targetOrigin từ `'*'` sang `window.location.origin`; chỉ render ảnh avatar nếu là URL http/https.

### `src/components/FormattedMessage.tsx`
- Thêm `isSafeUrl`/`isSafeImageUrl`: link Markdown chỉ nhận `http/https/mailto/tel` (chặn `javascript:`); ảnh chỉ nhận `http/https` (chặn `data:`/`javascript:`). URL không an toàn → hiển thị text thường / bỏ ảnh.

### `src/components/ProductCatalog.tsx`
- Thêm `safeHref`/`safeImg`; áp cho link & ảnh sản phẩm (cả bảng và lưới); thêm `onError` ẩn ảnh hỏng ở lưới.

### `src/components/AgentPersonaConfig.tsx`
- Bỏ ô nhập API Key & Custom Endpoint; thay bằng thông báo "key quản lý ở phía máy chủ".
- `handleSubmit` không còn đính kèm/persist `customApiKey`/`providerApiKeys`/`providerEndpoints`/`customApiEndpoint`.

### `src/App.tsx`
- Trước khi lưu localStorage và gửi `POST /api/config`, loại bỏ mọi trường key khỏi `agentConfig`.

### `.gitignore`
- Thêm `firebase-applet-config.json`, `supabase_config.json`, `server_store.json`.

### `.env.example`
- Bổ sung `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `CUSTOM_OPENAI_ENDPOINT`, `CUSTOM_OPENAI_API_KEY`, `ALLOWED_ORIGINS`.

---

## 3. Cách kiểm tra (test nhanh)

1. **Chạy dev**: `bun run dev` (hoặc `npm run dev`), mở app.
2. **Chat**: đảm bảo `GEMINI_API_KEY` có trong `.env` → gửi tin, agent trả lời bình thường.
3. **SSRF (phải bị chặn)**: ở tab Cơ sở tri thức, thử crawl `http://169.254.169.254/` hoặc `http://localhost` → phải báo lỗi "bị chặn vì lý do bảo mật".
4. **Crawl thật**: crawl một website công khai bình thường → vẫn hoạt động.
5. **XSS link**: cho agent trả về link dạng `[x](javascript:alert(1))` (hoặc tự test component) → phải hiển thị text, không tạo thẻ `<a>`.
6. **Key không lộ**: mở DevTools → Application → localStorage: `aistudio_agent_config` không còn chứa `customApiKey`/`providerApiKeys`. Gọi `GET /api/config` → không có trường key.
7. **Lint/build**: `npm run lint` (tsc --noEmit) và `npm run build`.

---

## 4. Những việc CHƯA làm trong đợt này (đề xuất đợt sau)

- **Xác thực/phân quyền** cho endpoint ghi (đã thống nhất hoãn) — đây vẫn là rủi ro còn lại quan trọng nhất: hiện `POST /api/config`, `/api/supabase/sync`, `/api/google/drive/*` vẫn chưa yêu cầu đăng nhập.
- **Supabase**: vẫn nhận URL/key từ client trong `/api/config/init` & `/api/supabase/test` và ghi `.env` lúc runtime (SEC-08); nên chuyển hẳn sang env + không tắt RLS.
- **Phiên Google OAuth dùng chung toàn cục** (SEC-04) — cần tách theo người dùng khi làm auth.
- **Rate-limit** và giảm giới hạn body 50MB (SEC-12).
- Dọn **system prompt bị lặp/hỏng ký tự** (ARC-04).
