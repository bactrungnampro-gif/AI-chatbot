# BÁO CÁO NGHIỆM THU MÃ NGUỒN — AI SALES AGENT

Phương pháp: 4 chuyên gia độc lập rà soát song song (bảo mật / hiệu năng / logic / toàn vẹn dữ liệu)
trên toàn bộ mã nguồn, sau đó **mỗi phát hiện dưới đây đều được xác minh lại trực tiếp trên mã thật**.
Các phát hiện không kiểm chứng được đã bị loại bỏ khỏi báo cáo này.

Ký hiệu: 🔧 = lỗi do các thay đổi gần đây (trách nhiệm của tôi).

---

## 🔴 NHÓM 1 — ĐANG GÂY MẤT TIỀN / MẤT KHÁCH (sửa ngay)

### 1.1 Ảnh sản phẩm bị chính hệ thống xoá khỏi câu trả lời
**`server.ts:2580-2596` (đăng ký URL) vs `2650, 2700` (đưa vào prompt) vs `promptBuilder.ts:98`**

Đã xác minh: `parseAndRegisterUrl()` chỉ đăng ký `k.url`, `subPages[].url`, URL trong `k.content`,
`p.sourceUrl`, URL trong `p.description`. **Không đăng ký `p.imageUrl`, `p.productUrl`, `k.sheetUrl`,
link tải Drive tự sinh.**

Nhưng `server.ts:2651` đưa `LINK HÌNH ẢNH SẢN PHẨM: {imageUrl}` vào prompt, và `promptBuilder.ts:98`
**bắt buộc** AI xuất `![Tên sản phẩm](URL_Hình_Ảnh)`.

Hệ quả: AI chèn ảnh → link guardrail không thấy trong `knownUrlSet` → **xoá sạch**. Khách nhận được
`!Tên sản phẩm` (còn dấu `!` rác). **100% ảnh sản phẩm và link tải tài liệu bị mất.**

Sửa: gọi `parseAndRegisterUrl` thêm cho `p.imageUrl`, `p.productUrl`, `k.sheetUrl`, link Drive;
sửa regex thành `/(!?)\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g` để xoá cả dấu `!` khi strip.

### 1.2 Khách cũ quay lại mua tiếp → KHÔNG tạo lead, KHÔNG thông báo
**`server.ts:2318-2321`**

```ts
// Comment ghi "trong 30 ngày" nhưng code KHÔNG có điều kiện thời gian nào:
const { data: existing } = await client.from('leads').select('id').eq('phone', phone).limit(1);
if (existing.length > 0) return { ok: true, dedup: true };   // return sớm, không insert, không notify
```

Dedupe áp dụng **vĩnh viễn**. Khách mua tháng 1, tháng 9 quay lại để lại đúng SĐT đó →
không lead mới, **không tin Telegram**, ghi chú và mã phiên mới bị vứt. Nhân viên không biết khách quay lại.

Sửa: thêm `.gte('created_at', <30 ngày trước>)`; khi trùng thì cập nhật lead cũ
(`session_id`, `note`, `status='new'`, `reminded_at=null`) và **vẫn** gửi thông báo.

### 1.3 `/api/lead` báo "đã lưu" ngay cả khi lưu THẤT BẠI
**`server.ts:3062-3066`**

```ts
const r = await saveLead({...});
if (!r.ok && r.reason === 'no_client') { ... }        // chỉ xử lý 1 loại lỗi
res.json({ success: true, saved: true, dedup: ... }); // MỌI lỗi khác vẫn báo thành công
```

Supabase gián đoạn 3 phút → khách để lại SĐT → widget hiện "đã ghi nhận" → **SĐT biến mất hoàn toàn**,
không Telegram, không dòng DB, không retry. Không ai biết.

Sửa: `saved: !!r.ok` + HTTP 503 khi lỗi; gọi `notifyNewLead()` song song với insert để Telegram làm lưới an toàn.

### 1.4 🔧 Tên khách trong form "Gặp nhân viên" bị vứt bỏ
**`server.ts:2367` và `3077`**

```ts
async function saveHandoff(req: { sessionId?; phone?; note? })   // KHÔNG có name
const { sessionId, phone, note } = req.body || {};               // /api/handoff KHÔNG đọc name
insert([{ ..., name: null, ... }]);                              // hardcode null
```

Widget có ô "Tên của Anh/Chị" và **có gửi lên**, nhưng server bỏ qua. Đây là **lỗi hồi quy** — tôi đã
viết phần này rồi nhưng bị mất khi workspace bị revert giữa chừng.

Sửa: thêm `name` vào type, đọc từ body, insert `name: (req.name||'').slice(0,200) || null`.

---

## 🟠 NHÓM 2 — BẢO MẬT

### 2.1 `/api/config` (công khai) lộ tiêu đề + link toàn bộ kho tri thức nội bộ
**`server.ts` `knowledgeMetaOnly()` + `auth.ts:20` (nằm trong allowlist công khai)**

Đã xác minh: `GET /api/config` không cần token và trả `knowledgeSources` gồm `title` + `url`.
Các URL này là link Google Sheets/Drive nội bộ — mà theo chính logic app, chúng **phải** ở chế độ
"Anyone with link can view" thì server mới đọc được.

```
curl https://<shop>/api/config | jq '.knowledgeSources[] | {title, url}'
```
→ ra danh sách kiểu `{"title":"Bảng giá sỉ 2026","url":"https://docs.google.com/..."}` → mở đọc trực tiếp.

Sửa: bỏ `knowledgeSources` khỏi response công khai (widget đã có `/api/widget-config` riêng);
admin lấy metadata qua endpoint đã được bảo vệ.

### 2.2 🔧 `clientIp()` tin `X-Forwarded-For` thô → vô hiệu hoá rate limit tôi vừa thêm
**`server.ts:2035-2038`**

```ts
const xf = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();  // client tự đặt được
```

Kẻ tấn công đổi header mỗi request → mỗi lần là một "IP" mới → trần 10 lần/10 phút vô nghĩa.
Có thể bơm hàng nghìn lead rác, mỗi cái sinh 1 tin Telegram → **lead thật bị chôn vùi**.

Sửa: `return req.ip || req.socket?.remoteAddress` — Express đã xử lý `trust proxy` đúng.

### 2.3 SSRF: kiểm tra an toàn URL rồi lại `fetch()` thường (tự follow redirect)
**`server.ts:554, 1125, 1159`**

`assertSafeExternalUrl()` được gọi, nhưng sau đó dùng `fetch()` mặc định `redirect:'follow'`.
Đã có sẵn `safeFetch()` xử lý đúng (kiểm từng hop) nhưng **chỉ dùng ở nhánh crawl sub-page**.

Server đối tác trả `302 → http://169.254.169.254/...` (metadata cloud) → nội dung được lưu thẳng
vào kho tri thức → khách hỏi chatbot là lấy ra được.

Sửa: thay `fetch(` → `safeFetch(` tại 3 vị trí trên.

### 2.4 `/api/chat` không giới hạn độ dài → đốt tiền API
**`server.ts:2515`** — không có `validateBody`, `MAX_BODY_SIZE` mặc định **15MB**, provider chỉ cắt
**số lượt** chứ không cắt độ dài mỗi lượt. Gửi `history` 8 lượt × 1.8MB, 20 lần/phút → hoá đơn AI
tăng vọt. `CHAT_DAILY_MAX` mặc định `0` = không giới hạn.

Sửa: `message` ≤ 4000 ký tự, `history` ≤ 12 lượt × 2000 ký tự, `attachments` ≤ 3; đặt `CHAT_DAILY_MAX`.

---

## 🟡 NHÓM 3 — LOGIC SAI (số liệu / trạng thái)

### 3.1 🔧 Thẻ sản phẩm hiện cả sản phẩm ĐÃ TẮT
**`server.ts:3032`** — `matchProductsInText(responseText, products)` dùng `products` thô,
trong khi prompt dùng `filteredProducts` (`p.active !== false`).
→ Tắt sản phẩm trong danh mục nhưng khách vẫn thấy thẻ có ảnh, giá, nút "Xem".
Sửa: đổi thành `filteredProducts`.

### 3.2 🔧 Dashboard "khung giờ cao điểm" lệch 7 tiếng
**`server.ts:3405`** — `new Date(r.created_at).getHours()` dùng múi giờ máy chủ (UTC trên Render),
trong khi báo cáo cuối ngày lại quy đổi UTC+7 → **hai chỗ tính giờ khác nhau**.
Khách nhắn nhiều lúc 20:00 VN → dashboard báo "cao điểm 13:00" → xếp ca sai.
Sửa: dùng `Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh' })` cho cả ngày và giờ.

### 3.3 🔧 Mở 2 tab → live chat chết im lặng
**`server.ts:3235`** — trần `poll:${session}` = 200 req/10 phút. Widget poll 5s = **120 req/10 phút/tab**,
mà `sessionId` lưu localStorage nên **2 tab dùng chung 1 session** = 240 > 200 → HTTP 429.
Widget nuốt lỗi (`if (!res.ok) return;`) → banner biến mất, tin nhân viên không tới, **khách không biết gì**.
Sửa: nâng trần ≥600 hoặc giới hạn theo `session+IP`; dừng poll khi `document.hidden`; log khi 429.

### 3.4 🔧 `.clear()` xoá luôn mục vừa ghi → reset chống spam
**`server.ts:2199, 2214, 2362`** — `map.set(...)` rồi ngay dòng sau `if (size > 5000) map.clear()`.
Mục vừa set bị xoá → `handoffAllowed()` cho phép lặp lại ngay thay vì chờ 10 phút.
Ngoài ra `.clear()` xoá cả mục còn hạn → cache stampede.
Sửa: dùng eviction theo TTL (mẫu đúng đã có sẵn ở `src/server/middleware/rateLimit.ts:33-36`).

### 3.5 FAQ chỉ nhận tiền tố "Câu hỏi:" — hai code path hiểu khác nhau
**`server.ts:2844`** dùng `/Câu hỏi\s*:/i`, trong khi **`rag.ts:27,32`** nhận 4 marker
(`Câu hỏi|Hỏi|Q|Question`). Nếu file FAQ dùng `Hỏi:` → `split` trả về **1 entry khổng lồ** →
vượt `FAQ_SELECT_CHARS` (12000) → `continue` → **toàn bộ FAQ biến mất khỏi prompt**.
File FAQ hiện tại của bạn dùng đúng `Câu hỏi:` nên **chưa bị**, nhưng rất dễ vỡ khi sửa file.
Sửa: dùng chung regex đa marker; entry quá dài thì cắt thay vì bỏ.

---

## 🔵 NHÓM 4 — HIỆU NĂNG

### 4.1 Widget polling chạy cho MỌI khách xem trang (không chỉ khách mở chat)
**`server.ts:4817, 4866`** — `iframe.src` được gán và `appendChild` **ngay khi tải trang**, chỉ ẩn bằng
`display:none`. Toàn bộ React app + vòng poll 5 giây chạy cho mọi khách vãng lai.

| Khách đồng thời | Query DB/phút |
|---|---|
| 50 | ~800 |
| 500 | ~8.000 (133 QPS) |

Trong khi thực tế có thể chỉ 2 người đang chat.
Sửa: chỉ gán `iframe.src` khi khách mở chat lần đầu; bỏ qua poll khi `document.hidden`;
giãn nhịp (5s khi có nhân viên, 20–30s khi không).

### 4.2 `/api/chat` quét lại toàn bộ kho tri thức 4 lần mỗi request
**`server.ts:2587, 2723, 2780, 2834`** — `allowedDomainsSet`, `knownUrlSet`, `linkDirectory`, FAQ entries
chỉ phụ thuộc kho tri thức (đổi vài lần/ngày) nhưng được **tính lại mỗi lượt chat**.
Đo thực tế: ~140ms CPU với KB 1.5MB, ước tính **300–450ms trên máy chủ nhỏ** — chặn event loop,
mọi request khác xếp hàng.
Sửa: precompute vào cache module-level, invalidate khi kho tri thức đổi.

### 4.3 🔧 `cleanupOldData` xoá bằng 1 câu DELETE khổng lồ → luôn timeout
**`server.ts:2157-2166`** — sau 180 ngày phải xoá hàng trăm nghìn dòng trong 1 statement.
PostgREST có `statement_timeout` (~8s) → **luôn timeout** → chỉ ghi 1 dòng warning → bảng
**không bao giờ được dọn**. Tính năng dọn dữ liệu tôi thêm thực chất **không hoạt động** ở quy mô lớn.
Sửa: xoá theo lô 1000 dòng, lặp đến hết, có nghỉ giữa các lô.

### 4.4 `writeFileSync` toàn bộ kho tri thức, pretty-print, trên đường hot
**`server.ts:4015-4021`** — `JSON.stringify(data, null, 2)` với toàn bộ `content` + ghi đồng bộ.
KB 10MB ⇒ **0,5–0,7 giây đóng băng event loop** mỗi lần admin sửa cấu hình (và mỗi 5 phút do AutoSync).
Sửa: bỏ `null, 2`; dùng `fs.promises.writeFile`; **loại `content`** khỏi file cache (Supabase là nguồn thật).

### 4.5 Thiếu index cho truy vấn nóng nhất
`/api/poll` chạy `WHERE session_id=? AND sender='staff' AND id > ?` mỗi 5 giây.
Nên bổ sung (chạy trong Supabase):
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_logs_session_staff
  ON chat_logs (session_id, id) WHERE sender = 'staff';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_status_created ON leads (status, created_at);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_chunks_trgm
  ON kb_chunks USING GIN (content gin_trgm_ops);
```

---

## ⚪ NHÓM 5 — TOÀN VẸN DỮ LIỆU

### 5.1 `ksSignature` dùng ĐỘ DÀI thay vì hash → nội dung sửa không được ghi xuống DB
**`server.ts:3607-3612`** so với **`rag.ts:237-240`** (dùng hash djb2, có comment giải thích rõ tại sao).
Giá đổi `1.200.000đ` → `1.500.000đ`: **độ dài giống hệt** → sig không đổi → không upsert.
Nhưng RAG dùng hash nên `kb_chunks` **có** cập nhật → hai bảng phân kỳ → sau restart, agent quay lại báo **giá cũ**.
Sửa: thêm `hashStr(s.content)` vào `ksSignature`.

### 5.2 `serverProducts` bị thay thế nguyên khối bằng payload client
**`server.ts:4752-4755`** — tri thức được union-merge theo `id` (đúng), nhưng **sản phẩm thì replace toàn bộ**.
Nếu `/api/config/init` lỗi mạng → `App.tsx` nuốt lỗi → state giữ bản localStorage cũ → admin sửa 1 ký tự →
POST đè **toàn bộ danh mục** bằng bản cũ. Không có soft delete, không khôi phục được.
Sửa: diff theo `id` như knowledge, hoặc optimistic concurrency (`baseUpdatedAt`).

### 5.3 `dedupeKnowledgeByUrl` xoá cứng tự động, comparator hỏng khi thiếu `updatedAt`
**`server.ts:3751-3765`** — chạy tự động mỗi 5 phút, **xoá cứng** khỏi Supabase, không backup, không audit.
Nếu `updated_at` NULL cả hai bản → `NaN !== NaN` là `true` → comparator trả `NaN` → thứ tự không xác định →
**có thể xoá nhầm bản mới**.
Sửa: `const d = (tb||0) - (ta||0); if (d) return d;` và đổi sang soft delete.

---

## THỨ TỰ KHẮC PHỤC ĐỀ XUẤT

| Ưu tiên | Mục | Lý do |
|---|---|---|
| 1 | 1.1, 1.2, 1.3, 1.4 | Đang mất khách/mất đơn hàng ngày |
| 2 | 2.1, 2.2, 2.4 | Rò rỉ dữ liệu + rủi ro chi phí |
| 3 | 3.1, 3.2, 3.3 | Số liệu sai dẫn tới quyết định sai |
| 4 | 4.5 (index), 4.3 | 15 phút, chống sập DB về sau |
| 5 | 4.1, 4.2, 4.4 | Chịu tải khi web đông khách |
| 6 | 5.1, 5.2, 5.3 | Toàn vẹn dữ liệu dài hạn |

## GHI NHẬN
Các mục đánh 🔧 (1.4, 2.2, 3.1, 3.2, 3.3, 3.4, 4.3) là lỗi phát sinh từ những thay đổi gần đây —
tức là do tôi. Mục 1.4 là **lỗi hồi quy** do sự cố workspace bị revert giữa phiên làm việc.
