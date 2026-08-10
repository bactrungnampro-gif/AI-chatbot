# Kiến trúc backend (Giai đoạn 2 — tái cấu trúc, increment 1)

Mục tiêu: tách dần `server.ts` (~3.700 dòng) thành các tầng module rõ ràng, **không đổi hành vi**. Increment này rút các phần thuần (pure) & hạ tầng ra khỏi file lớn và thiết lập bộ khung thư mục để các increment sau tiếp tục tách route/service.

> Ràng buộc môi trường: app chạy trên máy người dùng (không build/chạy được ở đây) và registry npm bị chặn (không thêm được `zod`). Vì vậy dùng lớp validate tự viết thay `zod`, và tách theo kiểu "strangler" để giảm rủi ro. Tất cả file đã qua kiểm tra cú pháp TypeScript.

## Cấu trúc hiện có

```
server.ts                         # bootstrap + đăng ký route (sẽ mỏng dần qua các increment)
src/server/
├─ security/
│  ├─ ssrf.ts                     # isPrivateIp, assertSafeExternalUrl, safeFetch (chống SSRF)
│  └─ sanitize.ts                 # escapeHtml, jsonForScript, stripAiSecrets
├─ scraper/
│  ├─ html.ts                     # cleanHtmlContent, extractPageTitle, extractInternalLinks, fetchSitemapUrls
│  └─ firecrawl.ts                # testFirecrawlApiKey, scrapeSingleWithFirecrawl, mapUrlsWithFirecrawl
├─ http/
│  ├─ errors.ts                   # AppError, ValidationError
│  ├─ asyncHandler.ts             # bọc handler async -> chuyển lỗi về error-handler
│  └─ validate.ts                 # validateBody(schema) — validate nhẹ thay zod
└─ middleware/
   └─ errorHandler.ts             # error-handler tập trung (đăng ký sau mọi route)
```

## Đã thay đổi trong `server.ts`
- Xóa các định nghĩa inline (SSRF, sanitize, scraper, firecrawl) → **import từ module**.
- Đăng ký **error-handler tập trung** (`app.use(errorHandler)`) trước khi `listen`.
- Áp `validateBody(...)` cho `/api/knowledge/scrape` (url) và `/api/knowledge/fetch-api-endpoint` (apiUrl) — minh hoạ pipeline validate ở biên.
- Dùng `asyncHandler(...)` cho `/api/firecrawl/test` — minh hoạ bắt lỗi async tự động.
- Kết quả: `server.ts` giảm ~370 dòng và có ranh giới tầng rõ ràng.

## Quy ước import
- Import tương đối, không đuôi mở rộng (`./src/server/...`) — tương thích cả `tsx` (dev) và `esbuild --bundle` (build).
- Module thuần không phụ thuộc state toàn cục; nhận tham số vào, trả kết quả ra → dễ test.

## Các increment kế tiếp (đề xuất)
1. **Store layer** (`src/server/store.ts`): gom state toàn cục (agentConfig, products, knowledgeSources, googleSessions) + load/save (file/Firestore/Supabase) sau một API rõ ràng.
2. **AI providers** (`src/server/providers/ai/*`): tách adapter Gemini/OpenAI/Anthropic sau interface chung `AIProvider`; `PromptBuilder` riêng.
3. **Routers** (`src/server/routes/*`): chuyển từng nhóm route (chat, knowledge, google, supabase, config) sang router riêng, controller mỏng gọi service.
4. **Config layer** (`src/server/config/env.ts`): tập trung đọc biến môi trường + hằng số.
5. Khi cài được package: thay validate tự viết bằng **zod** và bật `tsconfig` strict cho toàn server.

## Kiểm tra
- Cú pháp: đã transpile toàn bộ file (không lỗi).
- Chạy thử (trên máy bạn): `npm run lint` (tsc --noEmit), `bun run dev`, rồi kiểm tra:
  - `/api/knowledge/scrape` không có `url` → trả **400 VALIDATION_ERROR**.
  - Crawl website bình thường vẫn hoạt động (dùng scraper module).
  - `/api/firecrawl/test` trả kết quả như cũ.
  - Một lỗi bất ngờ trong route async → trả JSON lỗi chuẩn (không treo request).
```
```
