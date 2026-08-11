# Kiến trúc backend (Giai đoạn 2 — tái cấu trúc)

Tách dần `server.ts` (file khổng lồ) thành các tầng module rõ ràng, **không đổi hành vi**. Làm theo kiểu "strangler" để giảm rủi ro (app đang chạy production). Tất cả file đã qua kiểm tra cú pháp TypeScript.

## Cấu trúc hiện có

```
server.ts                         # bootstrap + đăng ký route (mỏng dần qua các increment)
src/server/
├─ security/
│  ├─ ssrf.ts                     # isPrivateIp, assertSafeExternalUrl, safeFetch
│  └─ sanitize.ts                 # escapeHtml, jsonForScript, stripAiSecrets
├─ scraper/
│  ├─ html.ts                     # cleanHtmlContent, extractPageTitle, extractInternalLinks, fetchSitemapUrls
│  └─ firecrawl.ts                # testFirecrawlApiKey, scrapeSingleWithFirecrawl, mapUrlsWithFirecrawl
├─ providers/
│  └─ ai/                         # [MỚI increment 2] Tầng nhà cung cấp AI (adapter + dispatcher)
│     ├─ types.ts                 # ChatParams, ProviderError
│     ├─ gemini.ts                # chatGemini (SDK @google/genai, cascade fallback)
│     ├─ openaiCompatible.ts      # chatOpenAICompatible (openai/deepseek/custom)
│     ├─ anthropic.ts             # chatAnthropic (Messages API)
│     └─ index.ts                 # generateChatResponse(params, geminiClient) — điều phối theo provider
├─ rag/
│  └─ rag.ts                      # chunk/embed/index/retrieve + resumable + auto-index
├─ http/
│  ├─ errors.ts                   # AppError, ValidationError
│  ├─ asyncHandler.ts             # bọc handler async
│  └─ validate.ts                 # validateBody(schema)
└─ middleware/
   └─ errorHandler.ts             # error-handler tập trung
```

## Increment 5 — Tầng cấu hình (config/env.ts) (vừa làm)
- Gom toàn bộ HẰNG SỐ đọc từ biến môi trường (PORT, MAX_BODY_SIZE, RATE_LIMIT_*, ALLOWED_ORIGINS, AUTH_ENABLED, ADMIN_EMAILS, INTERNAL_API_SECRET, RAG_*, LINK_DIR_MAX_CHARS, OAUTH_STATE_SECRET) về `src/server/config/env.ts`.
- `env.ts` TỰ gọi `dotenv.config()` ở đầu (vì import nạp trước thân server.ts) -> đọc `.env` đúng thời điểm.
- Định nghĩa giữ NGUYÊN; đã kiểm thử runtime: các giá trị parse/mặc định/derived (vd RAG_AUTO_INDEX) khớp logic cũ.
- `server.ts` giảm khai báo cấu hình rải rác, chỉ còn import từ env.ts.

## Increment 4 — Tầng tài liệu (documents.ts) (đã làm)
- Tách 3 hàm bóc tách tài liệu khỏi `server.ts` sang `src/server/services/documents.ts`: `extractDocxText`, `extractXlsxText` (thuần, chỉ dùng zlib), và `extractTextFromAttachmentData` (nhận `getAi` qua tham số — dependency injection cho OCR PDF).
- Sao chép NGUYÊN VĂN; đã kiểm thử trên tệp thật: .xlsx (29 dòng, 28 link) và .docx (tiêu đề + link) cho kết quả GIỐNG HỆT trước -> không đổi hành vi.
- `server.ts` bỏ luôn import `zlib` (không còn dùng trực tiếp) và giảm ~187 dòng.

## Increment 3 — PromptBuilder (đã làm)
- Tách toàn bộ phần dựng `systemInstruction` của `/api/chat` sang `src/server/services/promptBuilder.ts` qua hàm thuần `buildChatSystemInstruction(params)`.
- Template được sao chép NGUYÊN VĂN — đã kiểm chứng byte-for-byte (8381 ký tự) giống hệt bản gốc -> prompt/hành vi KHÔNG đổi.
- `server.ts` giờ chỉ gom các biến (agentConfig, tên/ngành doanh nghiệp, allowedDomainsListStr, linkDirectory, knowledgeContextText, activeProducts) rồi gọi builder.
- Đã kiểm thử render: 2 nhánh clarification, các giá trị fallback khi rỗng, không rò rỉ `undefined`, không sót `${`.
- Ghi chú: hàm bóc tách tài liệu (`extractDocxText`, `extractTextFromAttachmentData`) hiện vẫn nằm trong `server.ts`; có thể tách sang `src/server/services/documents.ts` ở increment sau.

## Increment 2 — Tầng AI providers (đã làm)
- Toàn bộ logic gọi từng nhà cung cấp AI trong `/api/chat` (Gemini cascade, OpenAI/DeepSeek, Anthropic) đã tách sang `src/server/providers/ai/*` sau interface chung `ChatParams`.
- `/api/chat` giờ chỉ: dựng systemInstruction (kèm RAG) → gọi `generateChatResponse(params, geminiClient)`.
- Lỗi thiếu API key ném `ProviderError(status=400)` -> controller trả đúng 400; lỗi khác -> 500.
- Thêm/đổi nhà cung cấp AI về sau chỉ cần thêm 1 adapter + 1 nhánh trong dispatcher.
- `server.ts` giảm ~230 dòng ở khối chat.

## Các increment kế tiếp (đề xuất — làm khi test được)
1. **Store layer** (`src/server/store.ts`): gom state toàn cục (agentConfig, products, knowledgeSources, googleSessions) + persistence (file/Firestore/Supabase) + ensureKnowledgeLoaded sau một API rõ ràng. RỦI RO CAO (đụng nhiều tham chiếu) -> làm khi có thể chạy test.
2. ~~**PromptBuilder**~~ ✅ ĐÃ LÀM (Increment 3).
3. **Routers** (`src/server/routes/*`): chuyển từng nhóm route (chat, knowledge, google, supabase, config, rag) sang router riêng, controller mỏng gọi service.
4. ~~**Config layer**~~ ✅ ĐÃ LÀM (Increment 5).
5. Khi cài được package: thay validate tự viết bằng **zod**; bật `tsconfig` strict cho server.

## Kiểm tra
- Cú pháp: đã transpile toàn bộ (không lỗi).
- Chạy thử (trên máy bạn): `npm run lint`, `npm run build`, `bun run dev`, rồi test chat với từng provider (Gemini/OpenAI/Claude) đảm bảo trả lời như trước; thiếu key -> trả 400 thông báo rõ.
```
```
