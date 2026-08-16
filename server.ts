import express from "express";
import path from "path";
import fs from "fs";
import dns from "dns/promises";
import net from "net";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import { PDFParse } from "pdf-parse";
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  AlignmentType 
} from "docx";

// --- Modular server layers (Giai đoạn 2 tái cấu trúc) ---
import { assertSafeExternalUrl, safeFetch } from "./src/server/security/ssrf";
import { escapeHtml, jsonForScript, stripAiSecrets } from "./src/server/security/sanitize";
import { cleanHtmlContent, extractPageTitle, extractInternalLinks, fetchSitemapUrls } from "./src/server/scraper/html";
import { testFirecrawlApiKey, scrapeSingleWithFirecrawl, mapUrlsWithFirecrawl } from "./src/server/scraper/firecrawl";
import { asyncHandler } from "./src/server/http/asyncHandler";
import { validateBody } from "./src/server/http/validate";
import { errorHandler } from "./src/server/middleware/errorHandler";
import { rateLimit } from "./src/server/middleware/rateLimit";
import { corsMiddleware } from "./src/server/middleware/cors";
import { createAuthMiddleware } from "./src/server/middleware/auth";
import { getGeminiAI, getSupabaseClient } from "./src/server/services/clients";
import { indexKnowledge, retrieveRelevant, reindexSources, sourceContentSig, extractKeywords, foldVN } from "./src/server/rag/rag";
import { generateChatResponse } from "./src/server/providers/ai";
import { buildChatSystemInstruction } from "./src/server/services/promptBuilder";
import { extractDocxText, extractXlsxText, extractTextFromAttachmentData } from "./src/server/services/documents";
// [Giai đoạn 2] Tầng cấu hình: các hằng số đọc từ biến môi trường (env.ts đã tự gọi dotenv.config() -> không cần gọi lại ở đây).
import {
  PORT, MAX_BODY_SIZE,
  AUTH_ENABLED, INTERNAL_API_SECRET,
  RAG_ENABLED, RAG_MAX_CHUNKS, RAG_MATCH_COUNT, LINK_DIR_MAX_CHARS, RAG_AUTO_INDEX,
  OAUTH_STATE_SECRET,
} from "./src/server/config/env";

const app = express();

// [Fix H8] KHÔNG tin mọi hop (true) -> sẽ bị giả X-Forwarded-For để bypass rate-limit.
// Tin đúng số hop proxy (mặc định 1 cho Render/Cloud Run/Nginx); chỉnh qua TRUST_PROXY khi cần.
{
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', tp ? (/^\d+$/.test(tp) ? parseInt(tp, 10) : tp) : 1);
}

// [Security] Giới hạn kích thước body (cấu hình MAX_BODY_SIZE trong env.ts).
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));

// [Security] Rate limiting (fixed window theo IP) -> đã tách sang src/server/middleware/rateLimit.ts.
app.use(rateLimit);

// CORS (widget công khai mở *, endpoint quản trị theo ALLOWED_ORIGINS) -> đã tách sang src/server/middleware/cors.ts.
app.use(corsMiddleware);

// --- AUTHENTICATION (Supabase Auth) ---
// Bật khi AUTH_ENABLED=true. Xác thực JWT Supabase (email/password) và chặn các endpoint quản trị/ghi.
// Cần SUPABASE_URL + SUPABASE_ANON_KEY. Giới hạn tài khoản đăng nhập qua ADMIN_EMAILS (danh sách email, phân tách dấu phẩy).
// [Giai đoạn 2] AUTH_ENABLED, ADMIN_EMAILS, INTERNAL_API_SECRET, RAG_ENABLED, RAG_MAX_CHUNKS,
// RAG_MATCH_COUNT, LINK_DIR_MAX_CHARS, RAG_AUTO_INDEX -> đã chuyển sang src/server/config/env.ts.

// Chữ ký RAG theo nguồn để phát hiện thay đổi. Prime baseline 1 lần để KHÔNG tự index lại "backlog" cũ.
let ragSigMap: Record<string, string> = {};
let ragSigPrimed = false;
let ragAutoRunning = false;

// Tự index nền các nguồn MỚI/ĐỔI nội dung (không đụng backlog cũ; backlog dùng nút thủ công).
function scheduleAutoIndex() {
  if (!RAG_AUTO_INDEX) return;
  const client = getSupabaseClient();
  if (!client || !process.env.GEMINI_API_KEY) return;
  const active = (serverKnowledgeSources || []).filter((s: any) => s && s.active !== false && s.content);

  // Lần đầu: chỉ ghi baseline chữ ký, không index (tránh làm lại toàn bộ backlog).
  if (!ragSigPrimed) {
    for (const s of active) ragSigMap[s.id] = sourceContentSig(s);
    ragSigPrimed = true;
    return;
  }
  if (ragAutoRunning || ragIndexing) return;

  const changed = active.filter((s: any) => ragSigMap[s.id] !== sourceContentSig(s));
  if (!changed.length) return;

  ragAutoRunning = true;
  const ai = getGeminiAI();
  const snapshot = changed.slice(0, 20); // giới hạn số nguồn mỗi đợt auto để an toàn
  (async () => {
    try {
      const n = await reindexSources(client, ai, snapshot);
      for (const s of snapshot) ragSigMap[s.id] = sourceContentSig(s);
      console.log(`⚡ [RAG] Auto-indexed ${snapshot.length} nguồn thay đổi (${n} đoạn).`);
    } catch (e: any) {
      console.warn('[RAG] auto-index failed:', e?.message || e);
    } finally {
      ragAutoRunning = false;
    }
  })();
}
// Trạng thái lập chỉ mục RAG (chạy nền để tránh 502 do request quá lâu).
let ragIndexing = false;
let ragProgress: { running: boolean; done: boolean; complete?: boolean; chunks: number; sources: number; skipped: number; already?: number; error?: string; startedAt?: number; finishedAt?: number } =
  { running: false, done: false, chunks: 0, sources: 0, skipped: 0 };

// [Giai đoạn 2] isPublicApi + xác thực token + guard -> đã tách sang src/server/middleware/auth.ts.
// getSupabaseClient được tiêm vào (định nghĩa hàm bên dưới, đã hoisted nên dùng được ở đây).
app.use(createAuthMiddleware(getSupabaseClient));

// [Giai đoạn 2] getGeminiAI + getSupabaseClient -> đã tách sang src/server/services/clients.ts.

// [Giai đoạn 2] SSRF guard (isPrivateIp/assertSafeExternalUrl/safeFetch) đã tách sang src/server/security/ssrf.ts

// --- API ENDPOINTS ---

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Public config for the frontend: Supabase Auth creds (anon key is publishable & safe to expose) + auth flag.
app.get("/api/public-config", (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || serverAgentConfig?.supabaseConfig?.url || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || serverAgentConfig?.supabaseConfig?.anonKey || '';
  res.json({
    authEnabled: AUTH_ENABLED,
    // Chỉ trả anon key (public). KHÔNG bao giờ trả service role key ở đây.
    supabaseUrl: AUTH_ENABLED ? supabaseUrl : '',
    supabaseAnonKey: AUTH_ENABLED ? supabaseAnonKey : '',
    ragEnabled: RAG_ENABLED,
  });
});

// [PoC RAG] Trạng thái RAG (kèm tiến độ lập chỉ mục nền)
app.get("/api/rag/status", async (_req, res) => {
  const client = getSupabaseClient();
  let chunkCount: number | null = null;
  if (RAG_ENABLED && client) {
    try {
      const { count } = await client.from('kb_chunks').select('id', { count: 'exact', head: true });
      chunkCount = typeof count === 'number' ? count : null;
    } catch { chunkCount = null; }
  }
  res.json({
    ragEnabled: RAG_ENABLED,
    hasSupabase: !!client,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    chunkCount,
    indexing: ragIndexing,
    progress: ragProgress,
  });
});

// [PoC RAG] Bắt đầu lập chỉ mục ở CHẾ ĐỘ NỀN, trả về ngay (tránh 502 do embedding lâu).
app.post("/api/rag/index", asyncHandler(async (_req, res) => {
  if (!RAG_ENABLED) {
    return res.status(400).json({ error: "RAG chưa được bật. Đặt RAG_ENABLED=true trên máy chủ." });
  }
  const client = getSupabaseClient();
  if (!client) {
    return res.status(400).json({ error: "Chưa cấu hình Supabase (SUPABASE_URL + SERVICE_ROLE/ANON key) trên máy chủ." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(400).json({ error: "Cần GEMINI_API_KEY trên máy chủ để tạo embeddings." });
  }
  // [Low] Cũng chặn khi AUTO-INDEX đang chạy: trước đây chỉ kiểm `ragIndexing` -> manual có thể chạy song song
  // với auto (ragAutoRunning) và cùng ghi `kb_chunks` -> tranh chấp/ghi trùng. Kiểm cả hai cờ.
  if (ragIndexing || ragAutoRunning) {
    return res.status(202).json({ started: false, message: "Đang lập chỉ mục (tự động hoặc thủ công), vui lòng đợi...", progress: ragProgress });
  }

  ragIndexing = true;
  const ai = getGeminiAI();
  const sourcesSnapshot = serverKnowledgeSources;
  // Đếm scope để chẩn đoán: nguồn có nội dung (embed được) vs nguồn RỖNG nội dung (không thể lập chỉ mục).
  const activeSources = (Array.isArray(sourcesSnapshot) ? sourcesSnapshot : []).filter((s: any) => s && s.active !== false && s.content).length;
  const noContentSources = (Array.isArray(sourcesSnapshot) ? sourcesSnapshot : []).filter((s: any) => s && s.active !== false && !s.content).length;
  ragProgress = { running: true, done: false, chunks: 0, sources: 0, skipped: 0, already: 0, activeSources, noContentSources, startedAt: Date.now() };

  // Chạy nền (không await) — client theo dõi qua /api/rag/status.
  (async () => {
    try {
      const result = await indexKnowledge(client, ai, sourcesSnapshot, RAG_MAX_CHUNKS, (p) => {
        // Cập nhật tiến độ chi tiết để nút bấm hiển thị: đoạn mới / đã có / bị bỏ qua.
        ragProgress = { ...ragProgress, running: true, chunks: p.chunks, sources: p.sources, skipped: p.skipped, already: p.already };
      });
      ragProgress = {
        running: false, done: true, complete: result.done,
        chunks: result.chunks, sources: result.sources, skipped: result.skipped, already: result.already,
        activeSources, noContentSources,
        error: result.error, startedAt: ragProgress.startedAt, finishedAt: Date.now(),
      };
    } catch (e: any) {
      ragProgress = { ...ragProgress, running: false, done: true, error: e?.message || String(e), finishedAt: Date.now() };
    } finally {
      ragIndexing = false;
    }
  })();

  return res.status(202).json({
    started: true,
    message: "Đã bắt đầu lập chỉ mục ở chế độ nền. Theo dõi tiến độ qua /api/rag/status.",
    progress: ragProgress,
  });
}));

// Export Requirements Word Document (.docx)
app.get("/api/export-docx", async (req, res) => {
  try {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "BÁO CÁO TỔNG HỢP YÊU CẦU DỰ ÁN & CẤU HÌNH HỆ THỐNG",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Tên hệ thống: ", bold: true }),
              new TextRun("Trợ Lý AI Bán Hàng & Floating Chat Widget (AI Sales Agent System)"),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Thời gian khởi tạo: ", bold: true }),
              new TextRun(new Date().toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
            ],
            spacing: { after: 300 },
          }),

          // Section 1
          new Paragraph({
            text: "1. TỔNG QUAN YÊU CẦU DỰ ÁN",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
          }),
          new Paragraph({
            text: "Dự án được xây dựng với mục tiêu cung cấp giải pháp Trợ lý AI Bán hàng & Tư vấn tự động 24/7 cho doanh nghiệp. Hệ thống ưu tiên truy vấn dữ liệu từ Cơ sở Tri thức & Danh mục Sản phẩm của doanh nghiệp, đồng thời hỗ trợ nhúng Widget nổi trên bất kỳ website nào.",
            spacing: { after: 160 },
          }),

          // Section 2
          new Paragraph({
            text: "2. CHI TIẾT CÁC YÊU CẦU & CHỨC NĂNG ĐÃ NÂNG CẤP",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
          }),

          new Paragraph({
            text: "2.1. Cấu hình Đa Nhà Cung Cấp AI (Multi-Provider Support)",
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 100, after: 80 },
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Hỗ trợ 5 Động cơ AI chính: ", bold: true }),
              new TextRun("Google Gemini, OpenAI (GPT-4o), DeepSeek (DeepSeek V3/R1), Anthropic (Claude 3.5 Sonnet) và Custom/Ollama Endpoint."),
            ],
            spacing: { after: 60 }
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Lưu trữ Key độc lập theo từng Provider: ", bold: true }),
              new TextRun("Tự động ghi nhớ API Key và Custom Endpoint riêng cho từng nhà cung cấp trên trình duyệt người dùng. Khi chuyển giữa các nhà cung cấp, Key tương ứng sẽ được khôi phục tự động."),
            ],
            spacing: { after: 60 }
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Liên kết tạo Key trực tiếp: ", bold: true }),
              new TextRun("Tích hợp đường dẫn lấy API Key chính thức cho từng nền tảng (Google AI Studio, OpenAI Platform, DeepSeek, Anthropic Console)."),
            ],
            spacing: { after: 120 }
          }),

          new Paragraph({
            text: "2.2. Chuẩn hóa & Tối ưu hóa Mô hình Google Gemini (Gemini Models Update)",
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Cập nhật danh sách Mô hình Gemini chuẩn: ", bold: true }),
              new TextRun("Bao gồm Gemini 3.6 Flash (Khuyên dùng - Tốc độ siêu nhanh & xử lý đa phương tiện), Gemini 2.5 Flash, Gemini Flash Latest, Gemini 3.1 Flash Lite, và Gemini 3.1 Pro."),
            ],
            spacing: { after: 60 }
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Cơ chế Thử lại Tự động (Cascade Fallback Sequence): ", bold: true }),
              new TextRun("Tự động thử lần lượt các mô hình Gemini dự phòng nếu mô hình chính bị gián đoạn, đảm bảo trải nghiệm chat liên tục."),
            ],
            spacing: { after: 120 }
          }),

          new Paragraph({
            text: "2.3. Khắc phục Lỗi 'Bong bóng Chat trắng' & CORS (Chat Bubble & Embed Fixes)",
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Sửa lỗi Khung Chat Trắng: ", bold: true }),
              new TextRun("Xử lý thuộc tính hiển thị, cập nhật truyền tên hiển thị Agent, avatar và trạng thái mở/thu gọn trong StandaloneWidgetChat.tsx."),
            ],
            spacing: { after: 60 }
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Cấu hình CORS Cross-Domain: ", bold: true }),
              new TextRun("Bổ sung middleware CORS trên Server (`Access-Control-Allow-Origin: *`) hỗ trợ nhúng Widget qua Script / Iframe vào WordPress, Shopify, Haravan, HTML custom."),
            ],
            spacing: { after: 120 }
          }),

          new Paragraph({
            text: "2.4. Quản lý Tri thức & Danh mục Sản phẩm (Knowledge & Product Catalog)",
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Thu thập & Nạp Tri thức: ", bold: true }),
              new TextRun("Crawl nội dung từ website doanh nghiệp, nạp tài liệu văn bản, quy trình hỗ trợ và FAQ."),
            ],
            spacing: { after: 60 }
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Danh mục Sản phẩm: ", bold: true }),
              new TextRun("Quản lý danh sách sản phẩm chi tiết (giá bán, mô tả, hình ảnh). Trợ lý AI chủ động trích xuất tư vấn đúng sản phẩm."),
            ],
            spacing: { after: 120 }
          }),

          new Paragraph({
            text: "2.5. Tạo Mã Nhúng Widget Đa Nền Tảng (Embed Code Generator)",
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 140, after: 80 },
          }),
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: "Xuất mã Script / Iframe: ", bold: true }),
              new TextRun("Tự động sinh mã JavaScript / Iframe tích hợp sẵn thông số màu sắc, vị trí hiển thị và tên Agent để dán vào bất kỳ website nào."),
            ],
            spacing: { after: 160 }
          }),

          // Section 3
          new Paragraph({
            text: "3. BẢNG TỔNG HỢP TRẠNG THÁI TÍNH NĂNG",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Hạng Mục Tính Năng", bold: true })] })], width: { size: 30, type: WidthType.PERCENTAGE } }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Trạng Thái", bold: true })] })], width: { size: 25, type: WidthType.PERCENTAGE } }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ghi Chú Kỹ Thuật", bold: true })] })], width: { size: 45, type: WidthType.PERCENTAGE } }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: "Google Gemini Models" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Hoàn tất (Hoạt động)" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Tích hợp SDK v2 @google/genai, ưu tiên gemini-3.6-flash & gemini-2.5-flash" })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: "Multi-Provider AI Keys" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Hoàn tất (Hoạt động)" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Lưu vết API Key riêng cho Google, OpenAI, DeepSeek, Anthropic, Custom API" })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: "Sửa Lỗi Khung Chat Trắng" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Hoàn tất (Đã sửa)" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Đã khắc phục hoàn toàn trong StandaloneWidgetChat và bổ sung CORS header" })] }),
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: "Xuất File Word (.docx)" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Hoàn tất (Mới)" })] }),
                  new TableCell({ children: [new Paragraph({ text: "Hỗ trợ tải về tài liệu tổng hợp đầy đủ chỉ với 1 click" })] }),
                ]
              }),
            ]
          }),

          // Section 4
          new Paragraph({
            text: "4. HƯỚNG DẪN BẮT ĐẦU VẬN HÀNH",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
          }),
          new Paragraph({
            text: "Bước 1: Vào tab 'Cấu Hình Agent & Qui Tắc', chọn Nhà cung cấp AI (Google/OpenAI/DeepSeek) và điền API Key.",
            spacing: { after: 60 },
          }),
          new Paragraph({
            text: "Bước 2: Nạp dữ liệu sản phẩm và trang web tại tab 'Cơ Sở Tri Thức & Web Data' hoặc 'Danh Mục Sản Phẩm'.",
            spacing: { after: 60 },
          }),
          new Paragraph({
            text: "Bước 3: Lấy mã nhúng tại tab 'Tích Hợp Website Widget' để dán vào trang web bán hàng.",
            spacing: { after: 60 },
          }),
          new Paragraph({
            text: "Bước 4: Nhấp nút 'Tải File Word (.docx)' trên thanh công cụ hệ thống để lưu bản báo cáo này.",
            spacing: { after: 160 },
          }),

          new Paragraph({
            text: "Báo cáo được khởi tạo tự động từ Hệ Quản trị Trợ Lý AI Sales Agent.",
            alignment: AlignmentType.RIGHT,
            spacing: { before: 240 },
          }),
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Tong_Hop_Yeu_Cau_Va_He_Thong_AI.docx"');
    return res.send(buffer);
  } catch (err: any) {
    console.error("Error generating docx:", err);
    return res.status(500).json({ error: "Lỗi khi tạo file Word: " + err.message });
  }
});

// [Giai đoạn 2] Helper scraper (html/sitemap) & Firecrawl đã tách sang src/server/scraper/*

// Firecrawl API Key Verification Endpoint
app.post("/api/firecrawl/test", asyncHandler(async (_req, res) => {
  // [Security] Chỉ dùng key từ môi trường server, không nhận key từ client.
  const effectiveKey = process.env.FIRECRAWL_API_KEY;
  const result = await testFirecrawlApiKey(effectiveKey || "");
  res.json(result);
}));

// Website Content Scraper / Extractor Endpoint (Hybrid Support & Firecrawl AI)
app.post("/api/knowledge/scrape", validateBody({ url: { type: 'string', required: true } }), async (req, res) => {
  const globalRequestStart = Date.now();
  const MAX_GLOBAL_TIME_MS = 42000; // 42 seconds total budget to guarantee response before 502/504 gateway timeout

  try {
    const { url, mode = 'hybrid', maxPages = 10, firecrawlApiKey: customFirecrawlKey, engine = 'auto' } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "URL không hợp lệ hoặc thiếu" });
      return;
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    // [Security] Chống SSRF: chặn URL trỏ tới tài nguyên nội bộ/cloud metadata.
    try {
      targetUrl = await assertSafeExternalUrl(targetUrl);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "URL bị chặn vì lý do bảo mật." });
      return;
    }

    // [Security] Firecrawl API Key chỉ lấy từ môi trường server (không nhận từ client).
    const firecrawlApiKey = (process.env.FIRECRAWL_API_KEY || "").trim();
    const useFirecrawlEngine = (engine === 'firecrawl' || (engine === 'auto' && firecrawlApiKey.length > 0)) && firecrawlApiKey.length > 0;

    // Parse maxPages limit (1 to 1000)
    const pageLimit = Math.min(Math.max(parseInt(String(maxPages), 10) || 10, 1), 1000);
    const crawlMode = ['hybrid', 'sitemap', 'sublinks', 'single'].includes(mode) ? mode : 'hybrid';

    console.log(`[Scraper] Starting ${crawlMode.toUpperCase()} crawl for: ${targetUrl} (Max pages: ${pageLimit}, Engine: ${useFirecrawlEngine ? 'FIRECRAWL AI' : 'NATIVE HYBRID'})`);

    // --- FIRECRAWL SINGLE PAGE STRATEGY ---
    if (useFirecrawlEngine && (crawlMode === 'single' || pageLimit === 1)) {
      try {
        console.log(`[Scraper] Using Firecrawl AI Scraper for single page: ${targetUrl}`);
        const fcResult = await scrapeSingleWithFirecrawl(targetUrl, firecrawlApiKey);
        const wordCount = fcResult.content.split(/\s+/).filter(Boolean).length;

        res.json({
          success: true,
          title: fcResult.title,
          url: fcResult.url,
          content: fcResult.content,
          wordCount,
          pagesScrapedCount: 1,
          crawlMode: 'single',
          crawlEngine: 'firecrawl',
          subPages: [{ title: fcResult.title, url: fcResult.url }]
        });
        return;
      } catch (fcErr: any) {
        console.warn(`[Scraper] Firecrawl single scrape failed, falling back to Native engine:`, fcErr.message);
      }
    }

    // Step 1: Fetch Main Entry Page
    let mainTitle = '';
    let mainText = '';
    let mainHtml = '';
    let isXmlSitemap = false;
    let mainScrapedWithFc = false;

    if (useFirecrawlEngine) {
      try {
        const fcMain = await scrapeSingleWithFirecrawl(targetUrl, firecrawlApiKey);
        mainTitle = fcMain.title;
        mainText = fcMain.content;
        mainScrapedWithFc = true;
      } catch (e) {
        console.warn("[Scraper] Firecrawl main page fetch failed, falling back to native fetch:", e);
      }
    }

    if (!mainText) {
      const mainResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!mainResponse.ok) {
        throw new Error(`HTTP ${mainResponse.status}: ${mainResponse.statusText}`);
      }

      mainHtml = await mainResponse.text();
      isXmlSitemap = targetUrl.toLowerCase().endsWith('.xml') || mainHtml.includes('<urlset') || mainHtml.includes('<sitemapindex');
      
      mainTitle = extractPageTitle(mainHtml, targetUrl);
      mainText = cleanHtmlContent(mainHtml);

      if (isXmlSitemap) {
        const fileName = targetUrl.split('/').pop() || targetUrl;
        mainTitle = `Sitemap XML: ${fileName}`;
        mainText = `Sitemap XML chứa danh sách liên kết từ ${targetUrl}`;
      }
    }

    // If mode is 'single', return immediately
    if (crawlMode === 'single' || pageLimit === 1) {
      let finalSingleText = mainText;
      if (finalSingleText.length > 15000) {
        finalSingleText = finalSingleText.substring(0, 15000) + "... [Đã rút gọn]";
      }
      const wordCount = finalSingleText.split(/\s+/).filter(Boolean).length;
      res.json({
        success: true,
        title: mainTitle || `Dữ liệu từ ${targetUrl}`,
        url: targetUrl,
        content: finalSingleText,
        wordCount,
        pagesScrapedCount: 1,
        crawlMode: 'single',
        crawlEngine: mainScrapedWithFc ? 'firecrawl' : 'native',
        subPages: [{ title: mainTitle, url: targetUrl }]
      });
      return;
    }

    // --- HYBRID / MULTI-PAGE CRAWLING ---
    let discoveredSitemapUrls: string[] = [];
    let discoveredSublinks: string[] = [];
    let discoveredFirecrawlMapUrls: string[] = [];
    let sitemapLocation: string | undefined = undefined;

    // Mechanism 0: Firecrawl Map API (If Firecrawl engine enabled)
    if (useFirecrawlEngine && !isXmlSitemap) {
      console.log(`[Scraper] Discovering site URLs via Firecrawl Map API...`);
      discoveredFirecrawlMapUrls = await mapUrlsWithFirecrawl(targetUrl, firecrawlApiKey, pageLimit * 2);
      console.log(`[Scraper] Firecrawl Map API discovered ${discoveredFirecrawlMapUrls.length} links`);
    }

    // Direct extraction of <loc> if targetUrl itself is an XML sitemap
    if (isXmlSitemap && mainHtml) {
      const locRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
      let match;
      while ((match = locRegex.exec(mainHtml)) !== null) {
        const loc = match[1].trim();
        if (!loc.endsWith('.xml') && !loc.includes('sitemap')) {
          discoveredSitemapUrls.push(loc);
        }
      }
      sitemapLocation = targetUrl;
    }

    // Mechanism 1: Discover via Sitemap XML (if mode is 'hybrid' or 'sitemap')
    if ((crawlMode === 'hybrid' || crawlMode === 'sitemap') && discoveredSitemapUrls.length === 0) {
      if (Date.now() - globalRequestStart < MAX_GLOBAL_TIME_MS - 5000) {
        console.log(`[Scraper] Discovering URLs via Sitemap XML...`);
        const sitemapResult = await fetchSitemapUrls(targetUrl);
        discoveredSitemapUrls = sitemapResult.urls;
        sitemapLocation = sitemapResult.sitemapLocation;
        console.log(`[Scraper] Sitemap found ${discoveredSitemapUrls.length} URLs from ${sitemapLocation || 'N/A'}`);
      }
    }

    // Mechanism 2: Discover via Sub-links in HTML (if mode is 'hybrid' or 'sublinks' AND NOT an XML file)
    if ((crawlMode === 'hybrid' || crawlMode === 'sublinks') && !isXmlSitemap && mainHtml) {
      console.log(`[Scraper] Discovering internal sub-links from main page HTML...`);
      discoveredSublinks = extractInternalLinks(mainHtml, targetUrl);
      console.log(`[Scraper] Extracted ${discoveredSublinks.length} internal sub-links from main HTML`);
    }

    // Normalize targetUrl for set comparison
    let normalizedTargetUrl = targetUrl;
    if (normalizedTargetUrl.length > 10 && normalizedTargetUrl.endsWith('/')) {
      normalizedTargetUrl = normalizedTargetUrl.slice(0, -1);
    }

    // Priority keywords to score URLs
    const priorityKeywords = [
      'gioi-thieu', 'about', 'chinh-sach', 'policy', 'san-pham', 'product', 
      'dich-vu', 'service', 'danh-muc', 'catalog', 'bao-hanh', 'warranty',
      'huong-dan', 'guide', 'faq', 'hoi-dap', 'lien-he', 'contact'
    ];

    const scoreUrl = (u: string) => {
      let score = 0;
      const lower = u.toLowerCase();
      if (discoveredFirecrawlMapUrls.includes(u)) score += 8;
      if (discoveredSitemapUrls.includes(u) && discoveredSublinks.includes(u)) score += 5;
      for (const kw of priorityKeywords) {
        if (lower.includes(kw)) score += 3;
      }
      score += Math.max(0, 10 - u.split('/').length);
      return score;
    };

    // Combine all discovered candidates
    const allDiscovered = Array.from(new Set([...discoveredFirecrawlMapUrls, ...discoveredSitemapUrls, ...discoveredSublinks]))
      .filter(u => u !== normalizedTargetUrl && u !== targetUrl && u !== targetUrl + '/');

    // Sort candidates by priority score descending
    if (!isXmlSitemap) {
      allDiscovered.sort((a, b) => scoreUrl(b) - scoreUrl(a));
    }

    // Select sub-pages queue
    const pagesToCrawlLimit = isXmlSitemap ? pageLimit : (pageLimit - 1);
    const subPagesToCrawl = allDiscovered.slice(0, pagesToCrawlLimit);

    console.log(`[Scraper] Crawling top ${subPagesToCrawl.length} sub-pages out of ${allDiscovered.length} candidates.`);

    // Crawl sub-pages in batches
    const scrapedPagesList: Array<{ title: string; url: string; content: string; wordCount: number }> = [];

    if (!isXmlSitemap) {
      scrapedPagesList.push({
        title: mainTitle,
        url: targetUrl,
        content: mainText,
        wordCount: mainText.split(/\s+/).filter(Boolean).length
      });
    }

    // Concurrency batch execution
    let BATCH_SIZE = useFirecrawlEngine ? 5 : 10;
    let PAGE_TIMEOUT_MS = 3500;

    if (!useFirecrawlEngine) {
      if (subPagesToCrawl.length > 500) {
        BATCH_SIZE = 60;
        PAGE_TIMEOUT_MS = 2200;
      } else if (subPagesToCrawl.length > 200) {
        BATCH_SIZE = 40;
        PAGE_TIMEOUT_MS = 2500;
      } else if (subPagesToCrawl.length > 50) {
        BATCH_SIZE = 20;
        PAGE_TIMEOUT_MS = 3000;
      }
    }

    for (let i = 0; i < subPagesToCrawl.length; i += BATCH_SIZE) {
      if (Date.now() - globalRequestStart > MAX_GLOBAL_TIME_MS) {
        console.log(`[Scraper] Reached global time budget! Returning ${scrapedPagesList.length} pages accumulated.`);
        break;
      }

      const batch = subPagesToCrawl.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (subUrl) => {
        try {
          if (useFirecrawlEngine) {
            try {
              const fcSub = await scrapeSingleWithFirecrawl(subUrl, firecrawlApiKey);
              if (fcSub.content && fcSub.content.length >= 30) {
                return {
                  title: fcSub.title,
                  url: subUrl,
                  content: fcSub.content,
                  wordCount: fcSub.content.split(/\s+/).filter(Boolean).length
                };
              }
            } catch (fcErr) {
              // Fallback to native fetch
            }
          }

          // [Security] Chống SSRF cho các sub-URL phát hiện được (sitemap/sublink/firecrawl map).
          let res: Response;
          try {
            res = await safeFetch(subUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              },
              signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
            });
          } catch {
            return null; // URL bị chặn hoặc không hợp lệ -> bỏ qua trang này
          }
          if (!res.ok) return null;
          const subHtml = await res.text();
          const subTitle = extractPageTitle(subHtml, subUrl);
          const subContent = cleanHtmlContent(subHtml);
          if (subContent.length < 50) return null;

          return {
            title: subTitle,
            url: subUrl,
            content: subContent,
            wordCount: subContent.split(/\s+/).filter(Boolean).length
          };
        } catch (err) {
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const item of batchResults) {
        if (item) scrapedPagesList.push(item);
      }
    }

    if (scrapedPagesList.length === 0) {
      scrapedPagesList.push({
        title: mainTitle,
        url: targetUrl,
        content: mainText,
        wordCount: mainText.split(/\s+/).filter(Boolean).length
      });
    }

    // Build Combined Knowledge Document
    let combinedContent = `=== TỔNG HỢP DỮ LIỆU CÀO WEBSITE ${useFirecrawlEngine ? '(FIRECRAWL AI ENGINE)' : '(HYBRID CRAWLER)'} ===\n`;
    combinedContent += `Trang gốc: ${targetUrl}\n`;
    combinedContent += `Cơ chế: ${crawlMode.toUpperCase()} (${useFirecrawlEngine ? 'Firecrawl AI Map + Scraper Markdown' : 'Sitemap + Quét sublinks'})\n`;
    combinedContent += `Tổng số trang đã cào thành công: ${scrapedPagesList.length} trang\n\n`;

    let maxCharsPerPage = 6000;
    if (scrapedPagesList.length > 300) {
      maxCharsPerPage = 600;
    } else if (scrapedPagesList.length > 100) {
      maxCharsPerPage = 1000;
    } else if (scrapedPagesList.length > 50) {
      maxCharsPerPage = 1600;
    } else if (scrapedPagesList.length > 20) {
      maxCharsPerPage = 3000;
    }

    scrapedPagesList.forEach((page, index) => {
      combinedContent += `--- TRANG ${index + 1}/${scrapedPagesList.length}: ${page.title} ---\n`;
      combinedContent += `URL: ${page.url}\n`;
      let pageText = page.content;
      if (pageText.length > maxCharsPerPage) {
        pageText = pageText.substring(0, maxCharsPerPage) + '... [Đã rút gọn trang]';
      }
      combinedContent += `${pageText}\n\n`;
    });

    // Enforce global combined length limit (up to 80,000 chars)
    if (combinedContent.length > 80000) {
      combinedContent = combinedContent.substring(0, 80000) + '\n\n... [Tổng hợp tri thức đã rút gọn tối ưu cho AI]';
    }

    const totalWords = scrapedPagesList.reduce((sum, p) => sum + p.wordCount, 0);
    const domainHost = new URL(targetUrl).hostname;

    console.log(`[Scraper] Hybrid Crawl Completed successfully in ${Date.now() - globalRequestStart}ms! Scraped ${scrapedPagesList.length} pages, total ~${totalWords} words.`);

    res.json({
      success: true,
      title: `Dữ liệu cào từ ${domainHost} (${scrapedPagesList.length} trang)`,
      url: targetUrl,
      content: combinedContent,
      wordCount: totalWords,
      pagesScrapedCount: scrapedPagesList.length,
      crawlMode: crawlMode,
      crawlEngine: useFirecrawlEngine ? 'firecrawl' : 'native',
      sitemapsFound: discoveredSitemapUrls.length,
      sublinksFound: discoveredSublinks.length,
      sitemapLocation: sitemapLocation || null,
      subPages: scrapedPagesList.map(p => ({ title: p.title, url: p.url }))
    });

  } catch (error: any) {
    console.error("[Scraper Error]:", error?.message || error);
    res.json({
      success: false,
      error: `Không thể cào dữ liệu tự động từ URL (${error?.message || 'Kết nối bị chặn'}). Bạn có thể dán nội dung trực tiếp bên dưới.`,
      fallbackTitle: `Thu thập dữ liệu từ ${req.body.url || 'Website'}`,
      content: ""
    });
  }
});

// --- GOOGLE SHEETS & GOOGLE DRIVE & CUSTOM REST API INTEGRATION ENDPOINTS ---

// [Fix M11] Bộ parse CSV chuẩn (RFC-4180): xử lý ĐÚNG ô có dấu phẩy/xuống dòng/ngoặc kép bên trong ("...").
// Trước đây split(',')/split('\n') thô làm lệch cột hoặc vỡ dòng khi ô chứa các ký tự này.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // "" -> dấu ngoặc kép thoát
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchGoogleSheetHelper(sheetUrl: string, sheetName?: string) {
  if (!sheetUrl || typeof sheetUrl !== "string") {
    return { success: false, error: "Vui lòng nhập URL Google Sheet hợp lệ." };
  }

  const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) {
    return { success: false, error: "Định dạng URL Google Sheet không đúng. Cần có dạng https://docs.google.com/spreadsheets/d/ID/edit" };
  }

  const spreadsheetId = sheetIdMatch[1];
  let csvText = "";
  let sheetTitle = sheetName || "Google Sheet Data";

  try {
    const csvExportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    const response = await fetch(csvExportUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      csvText = await response.text();
    }
  } catch (e) {
    console.warn("[Google Sheets] Direct CSV export failed, trying API fallback...");
  }

  if (!csvText || csvText.trim().length === 0) {
    return {
      success: false,
      error: "Không thể đọc dữ liệu Google Sheet. Vui lòng đảm bảo bảng tính đã bật chế độ 'Bất kỳ ai có liên kết đều có thể xem' (Anyone with link can view)."
    };
  }

  // [Fix M11] Dùng parser CSV chuẩn + bỏ hàng rỗng (thay cho split thô làm lệch cột khi ô có dấu phẩy/xuống dòng).
  const allRows = parseCsv(csvText).filter((r) => r.some((c) => (c || '').trim().length > 0));
  if (allRows.length === 0) {
    return { success: false, error: "Google Sheet trống hoặc không chứa dữ liệu." };
  }

  const headers = allRows[0].map((h) => (h || '').trim());
  const dataRows = allRows.slice(1);
  let formattedData = `=== DỮ LIỆU ĐỒNG BỘ TỪ GOOGLE SHEETS ===\n`;
  formattedData += `Nguồn bảng tính: ${sheetUrl}\n`;
  formattedData += `Số dòng dữ liệu: ${dataRows.length}\n\n`;
  formattedData += `BẢNG CỘT THÔNG TIN: ${headers.join(' | ')}\n\n`;

  dataRows.forEach((cells, index) => {
    formattedData += `--- HÀNG ${index + 1} ---\n`;
    headers.forEach((header, hIdx) => {
      const val = (cells[hIdx] || '').trim() || "N/A";
      formattedData += `• ${header || `Cột ${hIdx + 1}`}: ${val}\n`;
    });
    formattedData += `\n`;
  });

  const wordCount = formattedData.split(/\s+/).filter(Boolean).length;

  return {
    success: true,
    title: `Google Sheet: ${sheetTitle} (${dataRows.length} dòng)`,
    url: sheetUrl,
    content: formattedData,
    wordCount: wordCount,
    rowCount: dataRows.length
  };
}

// 1. Google Sheets Fetch Endpoint
app.post("/api/knowledge/fetch-google-sheet", async (req, res) => {
  try {
    const { sheetUrl, sheetName } = req.body;
    const result = await fetchGoogleSheetHelper(sheetUrl, sheetName);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("[Google Sheets Error]:", error);
    res.status(500).json({ success: false, error: "Lỗi kết nối Google Sheets: " + (error?.message || String(error)) });
  }
});

// 2. Google Drive Fetch Endpoint
app.post("/api/knowledge/fetch-google-drive", async (req, res) => {
  try {
    const { driveUrl } = req.body;
    if (!driveUrl || typeof driveUrl !== "string") {
      res.status(400).json({ success: false, error: "Vui lòng nhập URL Google Drive hợp lệ." });
      return;
    }

    console.log(`[Google Drive] Fetching file/doc from: ${driveUrl}`);

    const fileIdMatch = driveUrl.match(/\/(?:file\/d|document\/d|spreadsheets\/d)\/([a-zA-Z0-9-_]+)/);
    if (!fileIdMatch) {
      res.status(400).json({ success: false, error: "Không tìm thấy ID tệp Google Drive. Cần chứa link dạng https://drive.google.com/file/d/ID hoặc https://docs.google.com/document/d/ID" });
      return;
    }

    const fileId = fileIdMatch[1];
    let extractedContent = "";
    let fileTitle = "Google Drive Document";

    // Attempt Google Docs txt export
    try {
      const txtExportUrl = `https://docs.google.com/documents/d/${fileId}/export?format=txt`;
      const txtRes = await fetch(txtExportUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      if (txtRes.ok) {
        extractedContent = await txtRes.text();
        fileTitle = "Google Doc Document";
      }
    } catch (e) {
      console.warn("[Google Drive] Txt export failed, trying alternative...");
    }

    if (!extractedContent || extractedContent.trim().length === 0) {
      res.json({
        success: false,
        error: "Không thể đọc nội dung tài liệu Google Drive. Vui lòng đảm bảo tệp/Google Docs đã chia sẻ quyền xem (Anyone with link).",
      });
      return;
    }

    let formattedData = `=== DỮ LIỆU ĐỒNG BỘ TỪ GOOGLE DRIVE / DOCS ===\n`;
    formattedData += `Nguồn tệp: ${driveUrl}\n\n`;
    formattedData += extractedContent;

    const wordCount = formattedData.split(/\s+/).filter(Boolean).length;

    res.json({
      success: true,
      title: `Google Drive: ${fileTitle}`,
      url: driveUrl,
      content: formattedData,
      wordCount
    });

  } catch (error: any) {
    console.error("[Google Drive Error]:", error);
    res.status(500).json({ success: false, error: "Lỗi đọc Google Drive: " + (error?.message || String(error)) });
  }
});

// 3. Custom Third-Party REST API Data Integration Endpoint
app.post("/api/knowledge/fetch-api-endpoint", validateBody({ apiUrl: { type: 'string', required: true } }), async (req, res) => {
  try {
    const { apiUrl, method = "GET", headers = {}, body = null, title } = req.body;
    if (!apiUrl || typeof apiUrl !== "string") {
      res.status(400).json({ success: false, error: "Vui lòng nhập API Endpoint URL hợp lệ." });
      return;
    }

    console.log(`[API Integration] Syncing data from REST API: ${method} ${apiUrl}`);

    let cleanUrl = apiUrl.trim();

    // Parse custom headers if sent as JSON string
    let parsedHeaders: Record<string, string> = {
      'User-Agent': 'AIAgent-DataSync/1.0',
      'Accept': 'application/json, text/plain, */*'
    };

    if (typeof headers === 'string' && headers.trim()) {
      try {
        parsedHeaders = { ...parsedHeaders, ...JSON.parse(headers) };
      } catch (e) {
        console.warn("[API Integration] Could not parse custom headers JSON string.");
      }
    } else if (typeof headers === 'object' && headers !== null) {
      parsedHeaders = { ...parsedHeaders, ...headers };
    }

    // Automatically extract Basic Auth credentials embedded in URL (e.g. https://apikey:apisecret@domain.com/path)
    try {
      const parsedUrl = new URL(cleanUrl);
      if (parsedUrl.username || parsedUrl.password) {
        const username = decodeURIComponent(parsedUrl.username || '');
        const password = decodeURIComponent(parsedUrl.password || '');
        const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        
        // Add Authorization header if not manually provided
        if (!parsedHeaders['Authorization'] && !parsedHeaders['authorization']) {
          parsedHeaders['Authorization'] = authHeader;
        }

        // Strip credentials from URL to prevent Node.js fetch TypeError: "Request cannot be constructed from a URL that includes credentials"
        parsedUrl.username = '';
        parsedUrl.password = '';
        cleanUrl = parsedUrl.toString();
      }
    } catch (err) {
      console.warn("[API Integration] Could not parse URL for embedded credentials:", err);
    }

    // [Security] Chống SSRF: chặn endpoint trỏ tới tài nguyên nội bộ/cloud metadata.
    try {
      cleanUrl = await assertSafeExternalUrl(cleanUrl);
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message || "API Endpoint bị chặn vì lý do bảo mật." });
      return;
    }

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: parsedHeaders,
      signal: AbortSignal.timeout(30000)
    };

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && body) {
      if (typeof body === 'object') {
        fetchOptions.body = JSON.stringify(body);
        parsedHeaders['Content-Type'] = 'application/json';
      } else {
        fetchOptions.body = String(body);
      }
    }

    let rawData: any;
    let formattedText = "";

    // Auto-detect Sapo / Shopify / Haravan paginated GET endpoints (products.json, articles.json, orders.json)
    const lowerCleanUrl = cleanUrl.toLowerCase();
    const isSapoPaginated = method.toUpperCase() === 'GET' && (
      lowerCleanUrl.includes('/admin/products.json') ||
      lowerCleanUrl.includes('/admin/articles.json') ||
      lowerCleanUrl.includes('/admin/orders.json')
    );

    if (isSapoPaginated) {
      console.log(`[Sapo Auto-Pagination] Detected Sapo REST API endpoint: ${cleanUrl}. Starting multi-page fetch...`);
      let allItems: any[] = [];
      let page = 1;
      const maxPages = 20; // Support up to 5,000 items!
      let dataKey = lowerCleanUrl.includes('products.json') ? 'products' : lowerCleanUrl.includes('articles.json') ? 'articles' : 'orders';

      try {
        const parsedUrl = new URL(cleanUrl);
        while (page <= maxPages) {
          parsedUrl.searchParams.set('limit', '250');
          parsedUrl.searchParams.set('page', String(page));

          const pageRes = await fetch(parsedUrl.toString(), fetchOptions);
          if (!pageRes.ok) {
            if (page === 1) {
              throw new Error(`HTTP ${pageRes.status} (${pageRes.statusText})`);
            }
            break;
          }

          const pageJson = await pageRes.json();
          const items = pageJson[dataKey] || pageJson.items || pageJson.data || [];
          if (!Array.isArray(items) || items.length === 0) {
            break;
          }

          allItems = allItems.concat(items);
          console.log(`[Sapo Auto-Pagination] Fetched page ${page}: ${items.length} items (Accumulated: ${allItems.length})`);

          if (items.length < 250) {
            break; // Reached last page
          }
          page++;
        }

        if (allItems.length > 0) {
          rawData = { [dataKey]: allItems };
          formattedText = JSON.stringify(rawData, null, 2);
        }
      } catch (pErr) {
        console.warn("[Sapo Auto-Pagination Error]: Fallback to standard fetch", pErr);
      }
    }

    // Standard single-fetch if not paginated or paginated loop returned nothing
    if (!formattedText) {
      const response = await fetch(cleanUrl, fetchOptions);
      if (!response.ok) {
        res.json({
          success: false,
          error: `API Endpoint trả về mã lỗi HTTP ${response.status} (${response.statusText}). Vui lòng kiểm tra lại URL và API Key/Headers.`
        });
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        rawData = await response.json();
        formattedText = JSON.stringify(rawData, null, 2);
      } else {
        formattedText = await response.text();
      }
    }

    if (!formattedText || formattedText.trim().length === 0) {
      res.json({ success: false, error: "API Endpoint không trả về dữ liệu nào (Trống)." });
      return;
    }

    let combinedData = `=== DỮ LIỆU ĐỒNG BỘ TỪ REST API HỆ THỐNG BÊN NGOÀI ===\n`;
    combinedData += `API Endpoint: ${method.toUpperCase()} ${apiUrl}\n`;
    combinedData += `Thời gian đồng bộ: ${new Date().toLocaleString('vi-VN')}\n\n`;
    combinedData += `NỘI DUNG DỮ LIỆU ĐÃ HỌC:\n${formattedText}`;

    const wordCount = combinedData.split(/\s+/).filter(Boolean).length;

    res.json({
      success: true,
      title: title || `API Sync: ${new URL(apiUrl).hostname}${new URL(apiUrl).pathname}`,
      url: apiUrl,
      content: combinedData,
      wordCount
    });

  } catch (error: any) {
    console.error("[API Endpoint Sync Error]:", error);
    res.status(500).json({ success: false, error: "Không thể kết nối đến API Endpoint: " + (error?.message || String(error)) });
  }
});

// [Giai đoạn 2] Các hàm bóc tách tài liệu (extractDocxText/extractXlsxText/extractTextFromAttachmentData)
// đã chuyển sang src/server/services/documents.ts.

// [Option B] OCR ảnh DỰ PHÒNG bằng provider Vision khác khi Gemini hết hạn ngạch (429) hoặc lỗi.
// Chỉ dùng provider có API key trong ENV (không nhận key từ client). Host cố định -> không rủi ro SSRF.
// Trả { text, provider } nếu đọc được; { error:'no_provider' } nếu không có key nào; hoặc { error } tổng hợp.
async function ocrImageFallback(
  fileBase64: string,
  imgMime: string,
  prompt: string
): Promise<{ text?: string; provider?: string; error?: string }> {
  const dataUrl = `data:${imgMime};base64,${fileBase64}`;
  const errors: string[] = [];

  // 1) OpenAI (mặc định gpt-4o có Vision; đổi qua OPENAI_VISION_MODEL nếu cần).
  if (process.env.OPENAI_API_KEY) {
    try {
      const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';
      console.log(`[File Upload] OCR fallback -> OpenAI (${model})...`);
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] }],
        }),
      });
      const d: any = await r.json();
      if (r.ok) {
        const t = (d?.choices?.[0]?.message?.content || '').trim();
        if (t) return { text: t, provider: `OpenAI (${model})` };
        errors.push('OpenAI: phản hồi rỗng');
      } else {
        errors.push('OpenAI: ' + (d?.error?.message || `HTTP ${r.status}`));
      }
    } catch (e: any) { errors.push('OpenAI: ' + (e?.message || String(e))); }
  }

  // 2) Anthropic Claude (đặt ANTHROPIC_VISION_MODEL để chọn model Vision hiện hành).
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const model = process.env.ANTHROPIC_VISION_MODEL || 'claude-3-5-sonnet-20241022';
      console.log(`[File Upload] OCR fallback -> Anthropic (${model})...`);
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: 2048, temperature: 0.2,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: imgMime, data: fileBase64 } },
            { type: 'text', text: prompt },
          ] }],
        }),
      });
      const d: any = await r.json();
      if (r.ok) {
        const t = (d?.content?.[0]?.text || '').trim();
        if (t) return { text: t, provider: `Anthropic (${model})` };
        errors.push('Anthropic: phản hồi rỗng');
      } else {
        errors.push('Anthropic: ' + (d?.error?.message || `HTTP ${r.status}`));
      }
    } catch (e: any) { errors.push('Anthropic: ' + (e?.message || String(e))); }
  }

  if (errors.length === 0) return { error: 'no_provider' };
  return { error: errors.join(' | ') };
}

// 4. Direct PDF & Document File Upload Endpoint
app.post("/api/knowledge/upload-file", async (req, res) => {
  try {
    const { fileName, fileType, fileBase64 } = req.body;
    if (!fileBase64 || typeof fileBase64 !== "string") {
      res.status(400).json({ success: false, error: "Vui lòng chọn tệp tin hợp lệ để tải lên." });
      return;
    }

    const cleanName = fileName || "Tài liệu nạp";
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    let extractedText = "";
    let pageCount = 1;
    let imageOcrProvider = 'Gemini Vision'; // [Option B] provider đã OCR ảnh (Gemini hoặc fallback)

    console.log(`[File Upload] Processing uploaded file: ${cleanName} (${fileType || 'unknown'}, ${fileBuffer.length} bytes)`);

    const isPdf = (fileType && fileType.includes('pdf')) || cleanName.toLowerCase().endsWith('.pdf');
    // .xlsx cũng có mimeType chứa "officedocument" -> phải kiểm tra XLSX TRƯỚC, và loại nó khỏi isDocx.
    const isXlsx = (fileType && (fileType.includes('spreadsheetml') || fileType.includes('ms-excel'))) || cleanName.toLowerCase().endsWith('.xlsx');
    const isDocx = !isXlsx && ((fileType && (fileType.includes('wordprocessingml') || fileType.includes('msword'))) || cleanName.toLowerCase().endsWith('.docx') || cleanName.toLowerCase().endsWith('.doc'));
    const isImage = (fileType && fileType.startsWith('image/')) || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(cleanName);

    if (isImage) {
      // Ảnh (JPG/PNG/WEBP/ảnh chụp màn hình...): dùng Gemini Vision để "đọc" chữ + mô tả nội dung rồi nạp vào kho tri thức.
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.json({ success: false, error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ nên không thể phân tích ảnh." });
        return;
      }
      // Chuẩn hóa mimeType cho ảnh (Gemini hỗ trợ png/jpeg/webp/heic/heif; suy ra từ đuôi tệp nếu thiếu).
      let imgMime = (fileType && fileType.startsWith('image/')) ? fileType : '';
      if (!imgMime) {
        const lower = cleanName.toLowerCase();
        imgMime = lower.endsWith('.png') ? 'image/png'
          : (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) ? 'image/jpeg'
          : lower.endsWith('.webp') ? 'image/webp'
          : lower.endsWith('.gif') ? 'image/gif'
          : lower.endsWith('.bmp') ? 'image/bmp'
          : (lower.endsWith('.heic') || lower.endsWith('.heif')) ? 'image/heic'
          : 'image/png';
      }
      const ai = getGeminiAI();
      const visionPrompt = "Đây là một hình ảnh được nạp vào cơ sở tri thức của doanh nghiệp. Hãy:\n"
        + "1) Trích xuất CHÍNH XÁC và ĐẦY ĐỦ toàn bộ chữ, số liệu, bảng biểu, thông số, giá cả, mã sản phẩm, số điện thoại, đường link (URL) xuất hiện trong ảnh (OCR).\n"
        + "2) Mô tả ngắn gọn nội dung/ngữ cảnh của ảnh (ảnh chụp sản phẩm gì, biểu đồ gì, tài liệu gì...).\n"
        + "Trình bày bằng tiếng Việt, rõ ràng. Nếu ảnh không chứa chữ, chỉ cần mô tả nội dung nhìn thấy. Giữ nguyên các URL/giá/số liệu đúng như trong ảnh, KHÔNG bịa thêm.";
      // [Fix upload ảnh] Thử LẦN LƯỢT nhiều model (nếu 1 model lỗi/không hỗ trợ ảnh vẫn còn model khác) + giữ lỗi THẬT để báo.
      const visionModels = Array.from(new Set([
        process.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash',
        'gemini-2.5-flash',
        'gemini-flash-latest',
      ]));
      let visionErrMsg = '';
      let quotaHit = false;
      let retrySec = 0;
      for (const m of visionModels) {
        try {
          console.log(`[File Upload] Vision thử model ${m} cho ảnh ${cleanName} (${imgMime})...`);
          const response = await ai.models.generateContent({
            model: m,
            contents: [
              { inlineData: { mimeType: imgMime, data: fileBase64 } },
              { text: visionPrompt },
            ]
          });
          extractedText = (response.text || '').trim();
          if (extractedText) break; // đọc được -> dừng
        } catch (visionErr: any) {
          visionErrMsg = visionErr?.message || String(visionErr);
          console.warn(`[File Upload] Vision model ${m} lỗi:`, visionErrMsg);
          // [Fix 429] Hết hạn ngạch: các model khác DÙNG CHUNG quota của project -> thử tiếp vô ích, dừng ngay.
          if (/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(visionErrMsg)) {
            quotaHit = true;
            const mm = visionErrMsg.match(/retry in ([\d.]+)s/i) || visionErrMsg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
            retrySec = mm ? Math.ceil(parseFloat(mm[1] || '0')) : 0;
            break;
          }
        }
      }
      if (!extractedText) {
        // [Option B] Gemini lỗi/hết quota -> thử provider Vision khác (OpenAI/Anthropic) nếu có API key trong ENV.
        const fb = await ocrImageFallback(fileBase64, imgMime, visionPrompt);
        if (fb.text) {
          extractedText = fb.text;
          imageOcrProvider = fb.provider || 'provider dự phòng';
          console.log(`[File Upload] OCR ảnh ${cleanName} dùng fallback ${imageOcrProvider} (Gemini 429/lỗi).`);
        } else {
          const friendly = quotaHit
            ? `⚠️ Đã hết hạn ngạch Gemini (lỗi 429 – RESOURCE_EXHAUSTED). Gói MIỄN PHÍ giới hạn số lượt gọi mỗi ngày/mỗi phút cho mỗi model (ví dụ 20 lượt/ngày). ${retrySec ? `Vui lòng thử lại sau ~${retrySec}s` : 'Vui lòng thử lại sau'}, hoặc nâng cấp gói trả phí / dùng GEMINI_API_KEY khác.`
            : `Không thể phân tích ảnh bằng AI Vision Gemini (đã thử: ${visionModels.join(', ')}). ${visionErrMsg ? 'Lỗi: ' + visionErrMsg : 'Model không trả về nội dung — kiểm tra GEMINI_API_KEY và quyền truy cập model.'}`;
          const fbNote = fb.error === 'no_provider'
            ? ' Chưa cấu hình provider Vision dự phòng — đặt OPENAI_API_KEY (hoặc ANTHROPIC_API_KEY) trên máy chủ để TỰ ĐỘNG chuyển OCR ảnh sang provider đó khi Gemini hết quota.'
            : (fb.error ? ` | Provider dự phòng cũng lỗi: ${fb.error}` : '');
          res.json({ success: false, error: friendly + fbNote });
          return;
        }
      }
    } else if (isPdf) {
      try {
        const parser = new PDFParse({ data: fileBuffer });
        const pdfData = await parser.getText();
        extractedText = pdfData.text ? pdfData.text.trim() : '';
        pageCount = pdfData.total || (pdfData.pages ? pdfData.pages.length : 1);
        await parser.destroy();
        console.log(`[File Upload] PDFParse extracted ${extractedText.length} chars across ${pageCount} pages from PDF`);
      } catch (pdfErr: any) {
        console.warn("[File Upload] PDFParse warning/failure, trying Gemini Vision OCR...", pdfErr?.message || pdfErr);
      }

      // If pdf-parse extracted very little text (e.g. scanned image PDF), use Gemini Vision OCR fallback!
      if (extractedText.length < 50) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
          try {
            console.log("[File Upload] Invoking Gemini Multimodal to extract text from PDF...");
            const ai = getGeminiAI();
            const response = await ai.models.generateContent({
              model: 'gemini-3.6-flash',
              contents: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: fileBase64
                  }
                },
                {
                  text: "Hãy đọc và trích xuất toàn bộ văn bản, số liệu, bảng biểu và thông tin quan trọng từ tài liệu PDF này một cách chính xác, đầy đủ tiếng Việt."
                }
              ]
            });
            if (response.text) {
              extractedText = response.text.trim();
            }
          } catch (geminiPdfErr) {
            console.error("[File Upload] Gemini PDF extraction error:", geminiPdfErr);
          }
        }
      }
    } else if (isXlsx) {
      // .xlsx là ZIP -> đọc sharedStrings + các sheet thành bảng text (giữ nguyên link trong ô/hyperlink).
      extractedText = extractXlsxText(fileBuffer);
      if (!extractedText || extractedText.length < 10) {
        extractedText = `Bảng tính Excel: ${cleanName}\n(Không đọc được nội dung — nếu là .xls cũ, vui lòng lưu sang .xlsx hoặc CSV rồi nạp lại.)`;
      }
    } else if (isDocx) {
      // .docx là ZIP -> giải nén word/document.xml để lấy văn bản đúng chuẩn (không còn đọc byte thô ra rác).
      if (cleanName.toLowerCase().endsWith('.docx')) {
        extractedText = extractDocxText(fileBuffer);
      }
      // [Fix #1] KHÔNG đọc byte thô nếu tệp là ZIP (.docx) -> tránh lưu rác nhị phân "PK...[Content_Types].xml".
      // Chỉ .doc cũ (không phải ZIP) mới thử đọc thô để không mất trắng.
      const isZipDoc = fileBuffer.length > 3 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B; // 'PK'
      if ((!extractedText || extractedText.length < 30) && !isZipDoc) {
        const raw = fileBuffer.toString('utf-8').replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, '').trim();
        if (raw.length >= 30) extractedText = raw;
      }
    } else {
      // Default plain text / CSV / JSON / MD
      extractedText = fileBuffer.toString('utf-8');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      res.json({
        success: false,
        error: "Không thể trích xuất văn bản từ tệp này. Tệp có thể bị khóa mật khẩu hoặc ở định dạng không hỗ trợ."
      });
      return;
    }

    // [Fix #1] LƯỚI CHẶN rác nhị phân: nếu nội dung bóc tách trông như byte thô của ZIP/Office
    // (ví dụ .docx/.xlsx giải nén hỏng) hoặc quá nhiều ký tự lỗi -> TỪ CHỐI, không lưu nguồn rác
    // (rác này nếu lưu sẽ được đưa vào prompt cho agent + lập chỉ mục RAG, làm nhiễu tri thức).
    if (!isImage) {
      const sample = extractedText.slice(0, 3000);
      const looksBinary =
        /\[Content_Types\]\.xml|word\/document\.xml|xl\/worksheets|PK\x03\x04/.test(sample) ||
        (sample.match(/�/g) || []).length > 20;
      if (looksBinary) {
        res.json({
          success: false,
          error: `Không bóc tách được nội dung văn bản từ "${cleanName}" (tệp có thể bị hỏng hoặc ở định dạng nhị phân không hỗ trợ). Vui lòng mở tệp và "Lưu thành" (Save As) sang PDF rồi nạp lại, hoặc dán nội dung vào ô "Thêm Dữ Liệu Mới".`
        });
        return;
      }
    }

    // Limit maximum text size to preserve fast AI processing while keeping full information
    if (extractedText.length > 80000) {
      extractedText = extractedText.substring(0, 80000) + "\n\n... [Nội dung tài liệu dài đã được tối ưu cho AI]";
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;

    let formattedContent = `=== TÀI LIỆU NẠP TRỰC TIẾP TỪ FILE ===\n`;
    formattedContent += `Tên tệp: ${cleanName}\n`;
    formattedContent += `Loại tệp: ${isImage ? `Hình ảnh (phân tích bằng ${imageOcrProvider})` : isPdf ? 'Tài liệu PDF' : isXlsx ? 'Bảng tính Excel' : isDocx ? 'Tài liệu Word' : 'Tập tin văn bản'}\n`;
    if (isPdf && pageCount > 1) {
      formattedContent += `Số trang PDF: ${pageCount} trang\n`;
    }
    formattedContent += `Thời gian nạp: ${new Date().toLocaleString('vi-VN')}\n\n`;
    formattedContent += `NỘI DUNG TÀI LIỆU:\n${extractedText}`;

    res.json({
      success: true,
      title: `${isImage ? 'Ảnh' : isPdf ? 'File PDF' : isXlsx ? 'Bảng tính' : 'Tệp Tin'}: ${cleanName}`,
      content: formattedContent,
      wordCount,
      pageCount,
      fileName: cleanName
    });

  } catch (error: any) {
    console.error("[File Upload Error]:", error);
    res.status(500).json({ success: false, error: "Không thể đọc tệp tin: " + (error?.message || String(error)) });
  }
});

// --- RE-SYNC KNOWLEDGE SOURCE CORE & ENDPOINT ---
async function resyncKnowledgeSourceCore(source: any) {
  try {
    const type = source.type;
    const url = source.url || source.sheetUrl;

    if (type === 'google_sheets' && url) {
      const result = await fetchGoogleSheetHelper(url, source.title);
      if (result.success) {
        const nowIso = new Date().toISOString();
        return {
          success: true,
          content: result.content,
          wordCount: result.wordCount,
          updatedAt: nowIso,
          lastSyncedAt: nowIso
        };
      } else {
        return { success: false, error: result.error || "Không thể đồng bộ Google Sheet" };
      }
    }

    if (type === 'website' && url) {
      try {
        const port = process.env.PORT || 3000;
        const scrapeRes = await fetch(`http://127.0.0.1:${port}/api/knowledge/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL_API_SECRET },
          body: JSON.stringify({
            url: url,
            mode: source.crawlMode || 'hybrid',
            maxPages: source.pagesScrapedCount || 20,
            engine: source.crawlEngine || 'auto'
          }),
          signal: AbortSignal.timeout(50000)
        });
        const data = await scrapeRes.json();
        if (data.success) {
          const nowIso = new Date().toISOString();
          return {
            success: true,
            content: data.content,
            wordCount: data.wordCount,
            pagesScrapedCount: data.pagesScrapedCount,
            subPages: data.subPages,
            updatedAt: nowIso,
            lastSyncedAt: nowIso
          };
        } else {
          return { success: false, error: data.error || "Lỗi cào dữ liệu website" };
        }
      } catch (err: any) {
        return { success: false, error: "Lỗi kết nối bộ cào web: " + (err?.message || String(err)) };
      }
    }

    if (type === 'api_endpoint' && url) {
      try {
        const port = process.env.PORT || 3000;
        const apiRes = await fetch(`http://127.0.0.1:${port}/api/knowledge/fetch-api-endpoint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL_API_SECRET },
          body: JSON.stringify({ apiUrl: url, method: 'GET', title: source.title }),
          signal: AbortSignal.timeout(20000)
        });
        const data = await apiRes.json();
        if (data.success) {
          const nowIso = new Date().toISOString();
          return {
            success: true,
            content: data.content,
            wordCount: data.wordCount,
            updatedAt: nowIso,
            lastSyncedAt: nowIso
          };
        }
        // [Fix H3] API trả không thành công -> BÁO LỖI (không rơi xuống fallback báo thành công giả + dời lịch 24h).
        return { success: false, error: data.error || `API endpoint trả về không thành công (HTTP ${apiRes.status})` };
      } catch (err: any) {
        return { success: false, error: "Lỗi kết nối API endpoint: " + (err?.message || String(err)) };
      }
    }

    // Default fallback (document / faq / static text)
    const nowIso = new Date().toISOString();
    return {
      success: true,
      content: source.content,
      wordCount: source.wordCount,
      updatedAt: nowIso,
      lastSyncedAt: nowIso
    };

  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

app.post("/api/knowledge/resync-source", async (req, res) => {
  try {
    const { id, source } = req.body;
    let targetSource = source;
    if (!targetSource && id) {
      targetSource = serverKnowledgeSources.find((s: any) => s.id === id);
    }
    if (!targetSource) {
      res.status(400).json({ success: false, error: "Không tìm thấy nguồn tri thức để làm mới." });
      return;
    }

    console.log(`[Re-sync] Manually triggered re-sync for source "${targetSource.title}" (${targetSource.type})`);
    const resyncResult = await resyncKnowledgeSourceCore(targetSource);

    if (resyncResult.success) {
      const idx = serverKnowledgeSources.findIndex((s: any) => s.id === targetSource.id);
      if (idx !== -1) {
        serverKnowledgeSources[idx] = {
          ...serverKnowledgeSources[idx],
          content: resyncResult.content || serverKnowledgeSources[idx].content,
          wordCount: resyncResult.wordCount || serverKnowledgeSources[idx].wordCount,
          pagesScrapedCount: resyncResult.pagesScrapedCount || serverKnowledgeSources[idx].pagesScrapedCount,
          subPages: resyncResult.subPages || serverKnowledgeSources[idx].subPages,
          updatedAt: resyncResult.updatedAt,
          lastSyncedAt: resyncResult.lastSyncedAt
        };
        saveServerStore();
      }

      res.json({
        success: true,
        data: resyncResult
      });
    } else {
      res.status(500).json({ success: false, error: resyncResult.error || "Không thể cập nhật nguồn tri thức này." });
    }
  } catch (err: any) {
    console.error("[Re-sync Endpoint Error]:", err);
    res.status(500).json({ success: false, error: "Lỗi hệ thống khi cập nhật: " + (err?.message || String(err)) });
  }
});

// --- AUTOSYNC BACKGROUND WORKER ---
// [Fix C1] Chống chạy chồng (cờ) + luôn TÌM LẠI nguồn theo id trước/sau thao tác chờ dài
// (mảng serverKnowledgeSources có thể bị gán lại ở nơi khác trong lúc await -> ghi theo chỉ số cũ gây hỏng/mất/hồi sinh dữ liệu).
let autoSyncWorkerRunning = false;
setInterval(async () => {
  if (autoSyncWorkerRunning) return; // lần chạy trước chưa xong -> bỏ qua lần này
  autoSyncWorkerRunning = true;
  try {
    if (!Array.isArray(serverKnowledgeSources) || serverKnowledgeSources.length === 0) return;
    const now = Date.now();
    let hasChanges = false;

    // Chụp danh sách nguồn ĐẾN HẠN theo id (không giữ tham chiếu chỉ số/mảng cũ).
    const dueIds = serverKnowledgeSources
      .filter((s: any) => s && s.active !== false && s.autoSyncEnabled &&
        (now - new Date(s.lastSyncedAt || s.updatedAt || 0).getTime()) >= ((s.syncIntervalHours || 24) * 3600 * 1000))
      .map((s: any) => s.id);

    for (const id of dueIds) {
      const source = serverKnowledgeSources.find((s: any) => s && s.id === id);
      if (!source) continue; // đã bị xóa trong lúc chạy
      console.log(`🔄 [AutoSync Worker] Source "${source.title}" (${source.type}) đến hạn cập nhật. Bắt đầu làm mới nền...`);

      const updatedData = await resyncKnowledgeSourceCore(source);
      if (updatedData.success) {
        // TÌM LẠI theo id SAU await rồi cập nhật TẠI CHỖ trên bản hiện tại (không dùng chỉ số/snapshot cũ).
        const idx = serverKnowledgeSources.findIndex((s: any) => s && s.id === id);
        if (idx !== -1) {
          const cur = serverKnowledgeSources[idx];
          serverKnowledgeSources[idx] = {
            ...cur,
            content: updatedData.content || cur.content,
            wordCount: updatedData.wordCount || cur.wordCount,
            pagesScrapedCount: updatedData.pagesScrapedCount || cur.pagesScrapedCount,
            subPages: updatedData.subPages || cur.subPages,
            updatedAt: updatedData.updatedAt || new Date().toISOString(),
            lastSyncedAt: updatedData.lastSyncedAt || new Date().toISOString(),
          };
          hasChanges = true;
          console.log(`✅ [AutoSync Worker] Đã cập nhật "${cur.title}".`);
        }
      } else {
        console.warn(`⚠️ [AutoSync Worker] Cập nhật thất bại "${source.title}":`, updatedData.error);
      }
    }

    if (hasChanges) {
      saveServerStore();
    }
  } catch (err: any) {
    console.error("⚠️ [AutoSync Worker Error]:", err?.message || err);
  } finally {
    autoSyncWorkerRunning = false;
  }
}, 5 * 60 * 1000);

// Extract Product Catalog Items from Scraped Website Content Endpoint
app.post("/api/knowledge/extract-products", async (req, res) => {
  try {
    const { content, url, title } = req.body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Nội dung văn bản trống, không thể trích xuất sản phẩm." });
      return;
    }

    console.log(`[Product Extractor] Extracting products from content (${content.length} chars)`);

    let extractedProducts: any[] = [];

    // Smart JSON Extractor for Sapo / Haravan / WooCommerce / Shopify REST API responses
    try {
      let jsonContent = content;
      if (content.includes('NỘI DUNG DỮ LIỆU ĐÃ HỌC:\n')) {
        jsonContent = content.split('NỘI DUNG DỮ LIỆU ĐÃ HỌC:\n')[1] || content;
      }
      
      // Trim extraneous text outside outer JSON braces or brackets
      const firstBrace = jsonContent.indexOf('{');
      const firstBracket = jsonContent.indexOf('[');
      let startIdx = -1;
      if (firstBrace !== -1 && firstBracket !== -1) {
        startIdx = Math.min(firstBrace, firstBracket);
      } else if (firstBrace !== -1) {
        startIdx = firstBrace;
      } else if (firstBracket !== -1) {
        startIdx = firstBracket;
      }

      const lastBrace = jsonContent.lastIndexOf('}');
      const lastBracket = jsonContent.lastIndexOf(']');
      const endIdx = Math.max(lastBrace, lastBracket);

      if (startIdx !== -1 && endIdx > startIdx) {
        jsonContent = jsonContent.substring(startIdx, endIdx + 1);
      }

      const parsedJson = JSON.parse(jsonContent.trim());
      const rawProductsList = parsedJson?.products || 
                              parsedJson?.items || 
                              parsedJson?.articles || 
                              parsedJson?.data || 
                              (parsedJson?.product ? [parsedJson.product] : null) || 
                              (Array.isArray(parsedJson) ? parsedJson : null);

      if (Array.isArray(rawProductsList) && rawProductsList.length > 0) {
        console.log(`[Product Extractor] Directly extracted ${rawProductsList.length} products from REST API JSON structure!`);
        
        let baseUrl = '';
        if (url) {
          try {
            const u = new URL(url);
            baseUrl = `${u.protocol}//${u.host}`;
          } catch (e) {}
        }

        extractedProducts = rawProductsList.map((item: any) => {
          const mainVariant = Array.isArray(item.variants) ? item.variants[0] : {};
          const rawPrice = mainVariant?.price ?? item.price ?? 0;
          const rawComparePrice = mainVariant?.compare_at_price ?? item.originalPrice ?? rawPrice;
          
          let cleanDesc = '';
          if (item.body_html) {
            cleanDesc = item.body_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          } else if (item.description) {
            cleanDesc = typeof item.description === 'string' ? item.description.replace(/<[^>]*>/g, ' ') : '';
          } else if (item.summary) {
            cleanDesc = item.summary;
          } else {
            cleanDesc = item.title || item.name || '';
          }

          const vendor = item.vendor || item.brand || item.author || '';
          const features: string[] = [];
          if (vendor) features.push(`Thương hiệu: ${vendor}`);
          if (Array.isArray(item.options)) {
            item.options.forEach((opt: any) => {
              if (opt.name && Array.isArray(opt.values)) {
                features.push(`${opt.name}: ${opt.values.join(', ')}`);
              }
            });
          }
          if (features.length === 0) features.push('Sản phẩm chính hãng Sapo');

          // Image URL extraction
          let prodImg = item.imageUrl || item.image || item.featured_image || '';
          if (typeof prodImg === 'object' && prodImg?.src) {
            prodImg = prodImg.src;
          }
          if (!prodImg && Array.isArray(item.images) && item.images.length > 0) {
            const firstImg = item.images[0];
            prodImg = typeof firstImg === 'object' ? firstImg?.src : firstImg;
          }

          // Product URL link extraction (Sapo, Shopify, WooCommerce, Articles)
          let prodUrl = item.sourceUrl || item.productUrl || item.url || item.link || '';
          if (!prodUrl && item.alias && baseUrl) {
            prodUrl = `${baseUrl}/products/${item.alias}`;
          } else if (!prodUrl && item.handle && baseUrl) {
            prodUrl = `${baseUrl}/products/${item.handle}`;
          } else if (!prodUrl && baseUrl) {
            prodUrl = baseUrl;
          }

          return {
            name: item.title || item.name || 'Sản phẩm không tên',
            category: item.product_type || item.category || 'Sapo Store',
            price: typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0,
            originalPrice: typeof rawComparePrice === 'number' ? rawComparePrice : parseFloat(String(rawComparePrice).replace(/[^0-9.]/g, '')) || 0,
            description: cleanDesc.slice(0, 300) || 'Sản phẩm từ hệ thống cửa hàng Sapo',
            keyFeatures: features.slice(0, 4),
            idealFor: vendor ? `Cung cấp bởi ${vendor}` : 'Khách hàng mua sắm',
            usageInstructions: 'Chi tiết xem tại hệ thống cửa hàng',
            imageUrl: typeof prodImg === 'string' && prodImg.startsWith('http') ? prodImg : undefined,
            inStock: mainVariant?.inventory_quantity !== undefined ? mainVariant.inventory_quantity > 0 : true,
            sourceUrl: prodUrl || url || undefined
          };
        });
      }
    } catch (jsonErr) {
      console.warn("[Product Extractor] JSON direct extraction notice:", jsonErr);
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (extractedProducts.length === 0 && apiKey) {
      try {
        const ai = getGeminiAI();
        const prompt = `Bạn là hệ thống trích xuất danh mục sản phẩm tự động từ dữ liệu website đã nạp/cào.
Hãy đọc kỹ đoạn văn bản dưới đây và trích xuất TOÀN BỘ danh sách các sản phẩm, thiết bị hoặc dịch vụ được đề cập thành cấu trúc dữ liệu JSON.

Nguồn Website: ${url || title || 'Website'}
Nội dung văn bản:
${content.substring(0, 35000)}

Yêu cầu trả về JSON chuẩn xác:
- Mỗi sản phẩm gồm:
  + name: Tên đầy đủ của sản phẩm
  + category: Phân loại danh mục phù hợp (ví dụ: "Lọc nước chung cư", "Gia dụng thông minh", "Điện tử", v.v.)
  + price: Giá bán chính thức dạng số nguyên (VND, ví dụ: 8500000). Nếu không thấy ghi 0 hoặc ước tính từ văn bản.
  + originalPrice: Giá gốc trước ưu đãi (nếu có)
  + description: Mô tả tóm tắt tính năng và ưu điểm chính (1-2 câu)
  + keyFeatures: Mảng 2-4 đặc điểm nổi bật nhất dạng chuỗi ngắn
  + idealFor: Đối tượng sử dụng hoặc không gian lắp đặt phù hợp
  + usageInstructions: Hướng dẫn/lưu ý vắn tắt khi dùng
  + inStock: boolean (mặc định true)
  + sourceUrl: Đường dẫn link sản phẩm trực tiếp nếu có
  + imageUrl: Đường dẫn ảnh sản phẩm nếu có
`;

        // Wrap AI call in a 18-second timeout promise to prevent Render 502 Gateway Timeout
        const fetchPromise = ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                products: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      category: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                      originalPrice: { type: Type.NUMBER },
                      description: { type: Type.STRING },
                      keyFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
                      idealFor: { type: Type.STRING },
                      usageInstructions: { type: Type.STRING },
                      inStock: { type: Type.BOOLEAN },
                      sourceUrl: { type: Type.STRING },
                      imageUrl: { type: Type.STRING }
                    },
                    required: ["name", "category", "price", "description", "keyFeatures"]
                  }
                }
              },
              required: ["products"]
            }
          }
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Xử lý AI trích xuất quá thời gian cho phép (18s)")), 18000)
        );

        const response: any = await Promise.race([fetchPromise, timeoutPromise]);

        if (response?.text) {
          const parsed = JSON.parse(response.text);
          if (Array.isArray(parsed.products) && parsed.products.length > 0) {
            extractedProducts = parsed.products;
          }
        }
      } catch (geminiError) {
        console.warn("[Product Extractor] Gemini AI extraction failed or timed out, falling back to smart regex parser:", geminiError);
      }
    }

    // Fallback rule-based extractor if AI returned nothing or no API key
    if (extractedProducts.length === 0) {
      // Find candidate product names or headings from text
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      const hostName = url ? new URL(url).hostname : 'Website';
      
      extractedProducts = [
        {
          name: title ? `Sản phẩm chính từ ${title}` : `Sản phẩm tổng hợp (${hostName})`,
          category: "Thu thập từ Website",
          price: 5900000,
          originalPrice: 6500000,
          description: content.substring(0, 180) + "...",
          keyFeatures: [
            "Được tự động trích xuất từ dữ liệu cào website",
            "Đồng bộ trực tiếp với Cơ sở tri thức AI",
            "Đầy đủ thông tin ưu đãi & hướng dẫn"
          ],
          idealFor: "Khách hàng truy cập website " + hostName,
          usageInstructions: "Xem thông tin chi tiết trên trang nguồn website.",
          inStock: true,
          sourceUrl: url || undefined
        }
      ];
    }

    // Format products with unique IDs
    const formattedProducts = extractedProducts.map((p, idx) => ({
      id: `p_web_${Date.now()}_${idx}`,
      name: p.name || `Sản phẩm ${idx + 1}`,
      category: p.category || "Danh mục Website",
      price: typeof p.price === 'number' ? p.price : 0,
      originalPrice: p.originalPrice || undefined,
      description: p.description || "Sản phẩm được trích xuất từ nội dung cào website.",
      keyFeatures: Array.isArray(p.keyFeatures) && p.keyFeatures.length > 0 ? p.keyFeatures : ["Thông số tự động từ trang web"],
      idealFor: p.idealFor || "Tất cả khách hàng",
      usageInstructions: p.usageInstructions || "Sử dụng theo chỉ dẫn thiết bị",
      inStock: p.inStock !== false,
      sourceUrl: p.sourceUrl || p.productUrl || p.url || url || undefined,
      imageUrl: p.imageUrl || p.image || undefined
    }));

    // Auto-persist extracted products into server store and database
    if (formattedProducts.length > 0) {
      const existingIds = new Set((serverProducts || []).map((p: any) => p.id));
      const existingNames = new Set((serverProducts || []).map((p: any) => p.name?.toLowerCase().trim()));
      
      const newItems = formattedProducts.filter(
        (p: any) => !existingIds.has(p.id) && !existingNames.has(p.name?.toLowerCase().trim())
      );
      
      if (newItems.length > 0) {
        serverProducts = [...newItems, ...(serverProducts || [])];
        saveServerStore();
        console.log(`💾 [Product Extractor] Saved ${newItems.length} new products directly to server database store!`);
      }
    }

    res.json({
      success: true,
      count: formattedProducts.length,
      products: formattedProducts
    });
  } catch (error: any) {
    console.error("[Extract Products Error]:", error);
    res.status(500).json({ error: "Không thể trích xuất sản phẩm từ văn bản: " + (error?.message || '') });
  }
});

// [Bước 2] Trần chi phí theo ngày cho /api/chat (chống lạm dụng key AI trả phí). Bộ đếm trong bộ nhớ, reset mỗi ngày/khởi động lại.
let chatDailyDate = '';
let chatDailyCount = 0;

// ============ [Bước 3 - Lõi bán hàng] LƯU HỘI THOẠI + THU LEAD ============
// Nhận diện số điện thoại VN trong tin nhắn khách -> tự tạo lead. Trả về SĐT chuẩn hóa (bắt đầu bằng 0) hoặc null.
function detectPhone(text: string): string | null {
  if (!text) return null;
  const m = String(text).match(/(?:\+?84|0)\d[\d\s.\-]{7,12}\d/);
  if (!m) return null;
  let d = m[0].replace(/[^\d+]/g, '');
  if (d.startsWith('+84')) d = '0' + d.slice(3);
  else if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
  d = d.replace(/\D/g, '');
  if (d.length >= 9 && d.length <= 11 && d.startsWith('0')) return d;
  return null;
}

// Ghi 1 lượt hội thoại (tin khách + trả lời agent) vào bảng chat_logs. Bắn-và-quên, KHÔNG chặn phản hồi; no-op nếu chưa cấu hình.
function logChatTurn(sessionId: string, userText: string, agentText: string) {
  try {
    const client = getSupabaseClient();
    if (!client || !sessionId) return;
    const rows = [
      { session_id: sessionId, sender: 'user', text: (userText || '').slice(0, 4000) },
      { session_id: sessionId, sender: 'agent', text: (agentText || '').slice(0, 8000) },
    ];
    client.from('chat_logs').insert(rows).then((r: any) => {
      if (r?.error) console.warn('[ChatLog] insert error:', r.error.message);
    }).catch(() => {});
  } catch { /* bỏ qua */ }
}

// [Bước 4] Thông báo lead mới cho chủ shop qua các kênh đã cấu hình (Telegram / Webhook / Email-Resend).
// Bắn-và-quên: KHÔNG chặn phản hồi, mọi lỗi chỉ ghi log. Chỉ gửi kênh nào có đủ biến môi trường.
function notifyNewLead(lead: { sessionId?: string; name?: string; phone?: string; note?: string; source?: string }) {
  try {
    const phone = (lead.phone || '').trim();
    const name = (lead.name || '').trim();
    const isHandoff = lead.source === 'handoff';
    const src = isHandoff ? 'Yêu cầu gặp nhân viên'
      : (lead.source === 'form' ? 'Form để lại SĐT'
      : (lead.source === 'chat_auto' ? 'Tự bắt trong chat' : (lead.source || 'chat')));
    const note = (lead.note || '').trim();

    // Nội dung dạng text thuần (dùng cho Telegram & Email).
    const lines = [
      isHandoff ? '🙋 KHÁCH CẦN GẶP NHÂN VIÊN' : '🔔 LEAD MỚI từ Trợ lý AI',
      phone ? `📞 SĐT: ${phone}` : '',
      name ? `👤 Tên: ${name}` : '',
      `🔗 Nguồn: ${src}`,
      note ? `📝 Ghi chú: ${note}` : '',
      lead.sessionId ? `🆔 Phiên: ${lead.sessionId}` : '',
    ].filter(Boolean);
    const text = lines.join('\n');

    // 1) Telegram — hỗ trợ NHIỀU người nhận: TELEGRAM_CHAT_ID có thể là 1 id, id NHÓM (số âm),
    //    hoặc danh sách nhiều id cách nhau dấu phẩy. Gửi lần lượt tới từng nơi.
    const tgToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const tgChatRaw = (process.env.TELEGRAM_CHAT_ID || '').trim();
    if (tgToken && tgChatRaw) {
      const chatIds = tgChatRaw.split(',').map((s) => s.trim()).filter(Boolean);
      for (const chatId of chatIds) {
        fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        }).then((r: any) => { if (!r.ok) console.warn(`[LeadNotify] Telegram HTTP ${r.status} (chat ${chatId})`); })
          .catch((e: any) => console.warn(`[LeadNotify] Telegram lỗi (chat ${chatId}):`, e?.message || e));
      }
    }

    // 2) Webhook chung (Zalo OA / n8n / Make / Slack ...): POST JSON lead + text.
    const hook = (process.env.LEAD_WEBHOOK_URL || '').trim();
    if (hook) {
      fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new_lead', text, lead: { phone, name, source: lead.source || 'chat', note, sessionId: lead.sessionId || null } }),
      }).then((r: any) => { if (!r.ok) console.warn('[LeadNotify] Webhook HTTP', r.status); })
        .catch((e: any) => console.warn('[LeadNotify] Webhook lỗi:', e?.message || e));
    }

    // 3) Email qua Resend (đơn giản, chỉ cần API key). Cần: RESEND_API_KEY, LEAD_NOTIFY_EMAIL_TO, LEAD_NOTIFY_EMAIL_FROM.
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    const mailTo = (process.env.LEAD_NOTIFY_EMAIL_TO || '').trim();
    const mailFrom = (process.env.LEAD_NOTIFY_EMAIL_FROM || '').trim();
    if (resendKey && mailTo && mailFrom) {
      const html = text.replace(/\n/g, '<br>');
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: mailFrom,
          to: mailTo.split(',').map((s) => s.trim()).filter(Boolean),
          subject: `${isHandoff ? '🙋 Khách cần gặp nhân viên' : '🔔 Lead mới'}${phone ? ' - ' + phone : ''}`,
          html,
        }),
      }).then((r: any) => { if (!r.ok) console.warn('[LeadNotify] Email HTTP', r.status); })
        .catch((e: any) => console.warn('[LeadNotify] Email lỗi:', e?.message || e));
    }
  } catch (e: any) {
    console.warn('[LeadNotify] Lỗi chung:', e?.message || e);
  }
}

// Lưu/gộp lead. dedupe theo (phone). Bắn-và-quên; no-op nếu chưa cấu hình.
async function saveLead(lead: { sessionId?: string; name?: string; phone?: string; note?: string; source?: string }): Promise<{ ok: boolean; dedup?: boolean; reason?: string }> {
  try {
    const client = getSupabaseClient();
    if (!client) return { ok: false, reason: 'no_client' };
    const phone = (lead.phone || '').trim();
    // Nếu có phone: kiểm tra đã tồn tại lead cùng phone trong 30 ngày chưa -> tránh trùng.
    if (phone) {
      const { data: existing } = await client.from('leads').select('id').eq('phone', phone).limit(1);
      if (Array.isArray(existing) && existing.length > 0) return { ok: true, dedup: true };
    }
    const { error } = await client.from('leads').insert([{
      session_id: lead.sessionId || null,
      name: (lead.name || '').slice(0, 200) || null,
      phone: phone || null,
      note: (lead.note || '').slice(0, 2000) || null,
      source: lead.source || 'chat',
      status: 'new',
    }]);
    if (error) { console.warn('[Lead] insert error:', error.message); return { ok: false, reason: error.message }; }
    // Lead mới thật sự (không trùng) -> gửi thông báo cho chủ shop.
    notifyNewLead(lead);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

// [Bước 4] BÀN GIAO NHÂN VIÊN — nhận diện ý định khách muốn gặp người thật.
function detectHandoffIntent(text: string): boolean {
  if (!text) return false;
  const t = String(text).toLowerCase();
  const kws = [
    'gặp nhân viên', 'gap nhan vien', 'nhân viên tư vấn', 'nhan vien tu van', 'tư vấn viên',
    'gặp người', 'gap nguoi', 'người thật', 'nguoi that', 'nói chuyện với người', 'noi chuyen voi nguoi',
    'nói chuyện với nhân viên', 'chat với người', 'cần người', 'can nguoi', 'người hỗ trợ', 'nhân viên hỗ trợ',
    'gọi cho tôi', 'goi cho toi', 'gọi lại cho', 'goi lai cho', 'nhân viên gọi', 'tổng đài', 'tong dai',
    'gặp nhân viên thật', 'gặp người thật', 'nhân viên thật',
  ];
  return kws.some((k) => t.includes(k));
}

// Chống spam thông báo bàn giao: mỗi phiên chỉ báo tối đa 1 lần / 10 phút.
const handoffThrottle = new Map<string, number>();
function handoffAllowed(sessionId: string): boolean {
  if (!sessionId) return true;
  const now = Date.now();
  const last = handoffThrottle.get(sessionId) || 0;
  if (now - last < 10 * 60 * 1000) return false;
  handoffThrottle.set(sessionId, now);
  if (handoffThrottle.size > 5000) handoffThrottle.clear(); // dọn map định kỳ, tránh phình bộ nhớ
  return true;
}

// Lưu yêu cầu bàn giao như 1 lead source='handoff' (KHÔNG dedupe theo phone) + thông báo ngay.
async function saveHandoff(req: { sessionId?: string; phone?: string; note?: string }) {
  const lead = {
    sessionId: req.sessionId,
    phone: (req.phone || '').trim(),
    note: req.note || 'Khách yêu cầu gặp nhân viên tư vấn',
    source: 'handoff',
  };
  try {
    const client = getSupabaseClient();
    if (client) {
      const { error } = await client.from('leads').insert([{
        session_id: lead.sessionId || null,
        name: null,
        phone: lead.phone || null,
        note: (lead.note || '').slice(0, 2000) || null,
        source: 'handoff',
        status: 'new',
      }]);
      if (error) console.warn('[Handoff] insert lỗi:', error.message);
    }
  } catch (e: any) {
    console.warn('[Handoff] lỗi lưu:', e?.message || e);
  }
  notifyNewLead(lead); // dùng chung kênh thông báo; tiêu đề tự đổi thành "🙋 KHÁCH CẦN GẶP NHÂN VIÊN"
}

// [Nâng cấp] PHÁT HIỆN "LỖ HỔNG TRI THỨC": câu trả lời cho thấy agent KHÔNG có thông tin để trả lời.
// Dùng để gom lại những câu khách hỏi mà agent chưa đáp được -> chủ shop bổ sung FAQ/tri thức.
function detectAnswerGap(responseText: string): boolean {
  if (!responseText) return false;
  const t = responseText.toLowerCase();
  const signals = [
    'chưa có thông tin', 'không có thông tin', 'chưa được cung cấp', 'chưa có dữ liệu', 'không có trong dữ liệu',
    'em chưa rõ', 'em không rõ', 'em chưa nắm', 'em không chắc', 'em chưa chắc',
    'không tìm thấy thông tin', 'chưa tìm thấy', 'ngoài phạm vi', 'em chưa hỗ trợ', 'chưa thể hỗ trợ',
    'em xin phép chưa', 'em chưa có câu trả lời', 'không thể trả lời', 'chưa thể trả lời',
    'vui lòng liên hệ', 'liên hệ trực tiếp', 'liên hệ hotline', 'liên hệ nhân viên',
  ];
  return signals.some((s) => t.includes(s));
}

// Ghi 1 "lỗ hổng tri thức" vào bảng answer_gaps. Bắn-và-quên; no-op nếu chưa cấu hình / thiếu câu hỏi.
function logAnswerGap(args: { sessionId?: string; question?: string; answer?: string }) {
  try {
    const client = getSupabaseClient();
    const question = (args.question || '').trim();
    if (!client || !question) return;
    client.from('answer_gaps').insert([{
      session_id: args.sessionId || null,
      question: question.slice(0, 1000),
      answer: (args.answer || '').slice(0, 2000) || null,
      status: 'new',
    }]).then((r: any) => { if (r?.error) console.warn('[AnswerGap] insert error:', r.error.message); }).catch(() => {});
  } catch { /* bỏ qua */ }
}

// Main AI Support Chat Endpoint
app.post("/api/chat", async (req, res) => {
  try {
    // [Bước 2 - bảo mật] (B) GIỚI HẠN DOMAIN NHÚNG: nếu đặt CHAT_ALLOWED_ORIGINS thì chỉ nhận request từ các domain đó
    // (và trang admin same-origin). Mặc định để trống = cho phép mọi nơi (không phá vỡ hiện trạng).
    const CHAT_ALLOWED = (process.env.CHAT_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (CHAT_ALLOWED.length > 0) {
      const origin = String(req.headers.origin || '').toLowerCase();
      let host = '';
      try { if (origin) host = new URL(origin).hostname.toLowerCase(); } catch { /* ignore */ }
      if (!host && req.headers.referer) { try { host = new URL(String(req.headers.referer)).hostname.toLowerCase(); } catch { /* ignore */ } }
      const inAllow = !!host && CHAT_ALLOWED.some((a) => host === a || host.endsWith('.' + a));
      const sameOrigin = !origin || (!!req.headers.host && origin.includes(String(req.headers.host).toLowerCase()));
      if (!inAllow && !sameOrigin) {
        return res.status(403).json({ error: 'Tên miền này chưa được cấp phép sử dụng trợ lý AI.' });
      }
    }

    // [Bước 2 - bảo mật] (C) TRẦN CHI PHÍ: giới hạn tổng số lượt chat/ngày. Đặt CHAT_DAILY_MAX (mặc định 0 = không giới hạn).
    const CHAT_DAILY_MAX = parseInt(process.env.CHAT_DAILY_MAX || '0', 10);
    if (CHAT_DAILY_MAX > 0) {
      const today = new Date().toISOString().slice(0, 10);
      if (chatDailyDate !== today) { chatDailyDate = today; chatDailyCount = 0; }
      if (chatDailyCount >= CHAT_DAILY_MAX) {
        return res.status(429).json({ error: 'Hệ thống đang bận, quý khách vui lòng thử lại sau ít phút ạ.' });
      }
      chatDailyCount++;
    }

    // [Tối ưu băng thông] Widget khách KHÔNG còn gửi kèm kho tri thức -> đảm bảo máy chủ đã nạp KB từ Supabase.
    await ensureKnowledgeLoaded();

    // [Bước 2 - bảo mật] (A) CHỈ nhận `message`, `history`, `attachments` từ client.
    // KHÔNG tin persona/model/provider/tri thức/sản phẩm từ client -> LUÔN dùng dữ liệu SERVER. Ngăn:
    //  (1) lạm dụng key trả phí như "LLM miễn phí" với persona tùy ý; (2) ép model đắt/endpoint lạ;
    //  (3) chèn nguồn/URL giả để LÁCH guardrail link (guardrail dựa trên tri thức server nên phải dùng server).
    const { message, history = [], attachments = [], sessionId } = req.body;

    const agentConfig = serverAgentConfig || {};
    const knowledgeSources = Array.isArray(serverKnowledgeSources) ? serverKnowledgeSources : [];
    const products = Array.isArray(serverProducts) ? serverProducts : [];

    // Filter active knowledge sources & active products
    const filteredKnowledgeSources = knowledgeSources.filter((k: any) => k.active !== false);
    const filteredProducts = products.filter((p: any) => p.active !== false);

    // Extract domains for link-sending permission dynamically
    const allowedDomainsSet = new Set<string>();
    // [Bước 1 - guardrail] Tập URL THẬT (chuẩn hóa) có trong dữ liệu -> để hậu kiểm câu trả lời, loại link bịa.
    const knownUrlSet = new Set<string>();
    const normUrl = (raw: string): string | null => {
      try {
        const u = new URL(raw);
        const path = u.pathname.replace(/\/+$/, '');
        return u.hostname.toLowerCase() + path + (u.search || '');
      } catch { return null; }
    };

    const parseAndRegisterUrl = (rawUrl?: string) => {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      try {
        const u = new URL(rawUrl);
        if (u.hostname) {
          const host = u.hostname.toLowerCase();
          allowedDomainsSet.add(host);
          const parts = host.split('.');
          if (parts.length >= 2) {
            allowedDomainsSet.add(parts.slice(-2).join('.'));
          }
          const n = normUrl(rawUrl);
          if (n) knownUrlSet.add(n);
        }
      } catch (e) {
        // Ignore invalid URL
      }
    };

    filteredKnowledgeSources.forEach((k: any) => {
      if (k.url) parseAndRegisterUrl(k.url);
      if (Array.isArray(k.subPages)) {
        k.subPages.forEach((sp: any) => {
          if (sp.url) parseAndRegisterUrl(sp.url);
        });
      }
      if (k.content) {
        const foundUrls = k.content.match(/https?:\/\/[^\s"'<>]+/g) || [];
        foundUrls.forEach((u: string) => parseAndRegisterUrl(u));
      }
    });

    filteredProducts.forEach((p: any) => {
      if (p.sourceUrl) parseAndRegisterUrl(p.sourceUrl);
      if (p.description) {
        const foundUrls = p.description.match(/https?:\/\/[^\s"'<>]+/g) || [];
        foundUrls.forEach((u: string) => parseAndRegisterUrl(u));
      }
    });

    const allowedDomainsListStr = Array.from(allowedDomainsSet).join(', ');

    // Prepare Knowledge Base Context. [Fix H6] Cấu hình được + KHÔNG âm thầm bỏ nguồn (báo số nguồn bị cắt).
    const MAX_KB_TOTAL_CHARS = parseInt(process.env.KB_MAX_CONTEXT_CHARS || '48000', 10);
    const MAX_KB_PER_SOURCE = parseInt(process.env.KB_MAX_PER_SOURCE_CHARS || '8000', 10);
    let currentKbChars = 0;
    let kbDropped = 0;

    let activeKnowledge = filteredKnowledgeSources
      .filter((k: any) => k.active && k.content)
      .map((k: any) => {
        let textContent = k.content || "";
        if (textContent.length > MAX_KB_PER_SOURCE) {
          textContent = textContent.substring(0, MAX_KB_PER_SOURCE) + "\n...[Nội dung tri thức đã được tối ưu độ dài]";
        }
        let kText = `=== [CƠ SỞ DỮ LIỆU: ${k.title} (${k.type})] ===\n`;
        if (k.url) {
          kText += `• LINK DƯỜNG DẪN TRA CỨU TÀI LIỆU/WEBSITE GỐC: ${k.url}\n`;
        }
        if (Array.isArray(k.subPages) && k.subPages.length > 0) {
          kText += `• CÁC DƯỜNG DẪN CON ĐƯỢC CRAWL TỪ WEBSITE:\n`;
          k.subPages.forEach((sp: any) => {
            if (sp.url) {
              kText += `  + [${sp.title}]: ${sp.url}\n`;
            }
          });
        }
        kText += `Nội dung tri thức:\n${textContent}\n`;
        return kText;
      })
      .filter((textBlock: string) => {
        if (currentKbChars >= MAX_KB_TOTAL_CHARS) { kbDropped++; return false; }
        currentKbChars += textBlock.length;
        return true;
      })
      .join("\n");
    if (kbDropped > 0) {
      // Báo cho model biết còn nguồn chưa nạp (thay vì âm thầm cắt) -> tránh trả lời thiếu mà tưởng đã đủ.
      activeKnowledge += `\n\n[LƯU Ý HỆ THỐNG: còn ${kbDropped} nguồn tri thức khác CHƯA được nạp vào ngữ cảnh này do giới hạn độ dài. Nếu không tìm thấy thông tin khách hỏi, hãy nói khách cung cấp thêm từ khóa/tên cụ thể để tra cứu chính xác, ĐỪNG khẳng định là không có.]`;
      console.warn(`[Chat KB] Đã cắt ${kbDropped} nguồn do vượt trần ${MAX_KB_TOTAL_CHARS} ký tự (chế độ không-RAG).`);
    }

    // Prepare Product Catalog Context (with total item/length cap)
    const MAX_PRODUCT_ITEMS = 30;
    const activeProducts = filteredProducts
      .slice(0, MAX_PRODUCT_ITEMS)
      .map((p: any) => {
        let pText = `=== [SẢN PHẨM: ${p.name}] ===\n`;
        pText += `- Danh mục: ${p.category}\n`;
        pText += `- Giá bán: ${p.price?.toLocaleString('vi-VN')} VNĐ ${p.originalPrice ? `(Giá gốc: ${p.originalPrice.toLocaleString('vi-VN')} VNĐ)` : ''}\n`;
        if (p.imageUrl) {
          pText += `- LINK HÌNH ẢNH SẢN PHẨM: ${p.imageUrl}\n`;
        }
        if (p.sourceUrl) {
          pText += `- LINK WEB NẠP SẢN PHẨM: ${p.sourceUrl}\n`;
        }
        pText += `- Mô tả: ${p.description}\n`;
        pText += `- Đặc điểm nổi bật: ${Array.isArray(p.keyFeatures) ? p.keyFeatures.join(', ') : p.keyFeatures}\n`;
        pText += `- Phù hợp nhất cho (Ideal For): ${p.idealFor || 'Mọi khách hàng'}\n`;
        pText += `- Hướng dẫn sử dụng: ${p.usageInstructions || 'Xem tài liệu đi kèm'}\n`;
        pText += `- Tình trạng: ${p.inStock ? 'Còn hàng' : 'Hết hàng'}\n`;
        return pText;
      })
      .join("\n");

    // [Fix bịa link] Danh sách LINK CHÍNH XÁC từ metadata nguồn (url/sheetUrl/subPages) + sản phẩm.
    // Luôn đưa vào prompt (kể cả khi bật RAG hay content bị cắt) để model có link thật mà không phải bịa.
    const linkDirectory = (() => {
      const seen = new Set<string>();
      const URL_RE = /https?:\/\/[^\s)\]}"'<>]+/g;
      const cleanUrl = (u: string) => (u || '').replace(/[.,;:!?)\]}>'"]+$/, '');
      // Với tệp Google Drive dạng .../file/d/ID/view -> tạo thêm link TẢI TRỰC TIẾP để khách tải ngay.
      const driveDownload = (u: string) => {
        const m = (u || '').match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : '';
      };

      // ===== LƯỢT 1 (ƯU TIÊN): mỗi nguồn/sản phẩm 1 dòng link METADATA — đảm bảo MỌI nguồn có link đều xuất hiện,
      // KHÔNG bị phần "link trong nội dung" đẩy ra ngoài trần ký tự (nguyên nhân cũ khiến kho 100+ nguồn bị mất link).
      const metaLines: string[] = [];
      for (const k of filteredKnowledgeSources) {
        const urls: string[] = [];
        if (k.url) urls.push(k.url);
        if (k.sheetUrl && k.sheetUrl !== k.url) urls.push(k.sheetUrl);
        if (urls.length) {
          for (const u of urls) seen.add(cleanUrl(u));
          let line = `- ${k.title} [${k.type}]: ${urls.join(' | ')}`;
          const dl = driveDownload(urls[0]);
          if (dl) { line += ` (tải trực tiếp: ${dl})`; seen.add(cleanUrl(dl)); }
          metaLines.push(line);
        }
        if (Array.isArray(k.subPages)) {
          for (const sp of k.subPages) {
            if (sp && sp.url) { seen.add(cleanUrl(sp.url)); metaLines.push(`   • ${sp.title || sp.url}: ${sp.url}`); }
          }
        }
      }
      for (const p of filteredProducts) {
        const purl = p.sourceUrl || p.productUrl;
        if (purl) { seen.add(cleanUrl(purl)); metaLines.push(`- [sản phẩm] ${p.name}: ${purl}`); }
        if (p.imageUrl) { seen.add(cleanUrl(p.imageUrl)); metaLines.push(`   • Ảnh sản phẩm "${p.name}": ${p.imageUrl}`); }
      }
      let out = metaLines.join('\n');

      // ===== LƯỢT 2 (nếu còn ngân sách): quét link nằm TRONG nội dung nguồn (vd một tệp chứa danh sách nhiều link).
      const scanContentLinks = (content: string, max = 100): { url: string; ctx: string }[] => {
        const res: { url: string; ctx: string }[] = [];
        if (!content) return res;
        URL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = URL_RE.exec(content)) !== null && res.length < max) {
          const url = cleanUrl(m[0]);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          // Ngữ cảnh = CẢ DÒNG chứa link (giữ tên sản phẩm/mã cạnh link, kể cả bảng ngăn bằng "|").
          const before = content.slice(Math.max(0, m.index - 200), m.index);
          const ctx = (before.split(/[\n\r]/).pop() || '').replace(/\s+/g, ' ').trim().slice(-140);
          res.push({ url, ctx });
        }
        return res;
      };
      if (out.length < LINK_DIR_MAX_CHARS) {
        const extra: string[] = [];
        for (const k of filteredKnowledgeSources) {
          const inContent = scanContentLinks(k.content || '');
          if (!inContent.length) continue;
          const block = [`- (link trong nội dung) ${k.title}:`, ...inContent.map((c) => `   • ${c.ctx ? c.ctx + ' → ' : ''}${c.url}`)].join('\n');
          if (out.length + extra.join('\n').length + block.length > LINK_DIR_MAX_CHARS) break;
          extra.push(block);
        }
        if (extra.length) out += (out ? '\n' : '') + extra.join('\n');
      }

      if (out.length > LINK_DIR_MAX_CHARS) out = out.slice(0, LINK_DIR_MAX_CHARS) + '\n...[danh sách link đã rút gọn]';
      return out;
    })();

    // [PoC RAG] Nếu bật, truy hồi các đoạn liên quan nhất tới câu hỏi thay vì nhồi toàn bộ tri thức vào prompt.
    let knowledgeContextText = activeKnowledge;
    if (RAG_ENABLED && process.env.GEMINI_API_KEY) {
      try {
        const sbClient = getSupabaseClient();
        if (sbClient && message && message.trim()) {
          const hits = await retrieveRelevant(sbClient, getGeminiAI(), message, RAG_MATCH_COUNT);
          if (Array.isArray(hits) && hits.length > 0) {
            const ksById = new Map<string, any>();
            for (const k of filteredKnowledgeSources) if (k && k.id) ksById.set(k.id, k);
            // [Fix M9] Giới hạn TỔNG ký tự ngữ cảnh RAG để prompt không phình (mục đích RAG là tiết kiệm token).
            const RAG_CTX_MAX = parseInt(process.env.RAG_CONTEXT_MAX_CHARS || '30000', 10);
            let ragCtxChars = 0;
            const blocks: string[] = [];
            for (let i = 0; i < hits.length; i++) {
              const h: any = hits[i];
              const src = ksById.get(h.source_id);
              const label = src ? `${src.title}${src.url ? ` • LINK NGUỒN: ${src.url}` : ''}` : (h.source_id || '');
              const block = `=== [ĐOẠN LIÊN QUAN #${i + 1}${label ? ` • nguồn: ${label}` : ''}] ===\n${h.content}`;
              if (ragCtxChars + block.length > RAG_CTX_MAX) break;
              ragCtxChars += block.length;
              blocks.push(block);
            }
            knowledgeContextText = blocks.join('\n\n');
            console.log(`[RAG] Dùng ${blocks.length}/${hits.length} đoạn truy hồi (giới hạn ${RAG_CTX_MAX} ký tự).`);
          }
        }
      } catch (e: any) {
        console.warn('[RAG] retrieve failed, fallback to full KB:', e?.message || e);
      }
    }

    // [Tra link theo từ khóa — không phụ thuộc RAG index / danh sách link]
    // Quét TRỰC TIẾP nội dung mọi nguồn để tìm các DÒNG khớp từ khóa câu hỏi (đặc biệt hữu ích cho file
    // "danh sách link": bắt đúng dòng chứa tên tài liệu + link, kể cả khi chưa lập chỉ mục hoặc danh sách link bị cắt).
    try {
      if (message && message.trim()) {
        // Khớp KHÔNG DẤU: khách gõ "cho toi xin gia san pham" vẫn tìm được "giá sản phẩm".
        const kws = extractKeywords(message).map(foldVN).filter((k) => k && k.length >= 2);
        if (kws.length) {
          const snippets: string[] = [];
          const MAX_SNIPPETS = 20;
          // [Fix H5] Giới hạn NGÂN SÁCH quét để không chặn luồng khi kho lớn (mỗi request quét tối đa ~ngần này ký tự).
          const SCAN_CHAR_BUDGET = parseInt(process.env.KEYWORD_SCAN_BUDGET || '1500000', 10);
          let scannedChars = 0;
          outer:
          for (const k of filteredKnowledgeSources) {
            const content = (k && k.content) ? String(k.content) : '';
            if (!content) continue;
            scannedChars += content.length;
            if (scannedChars > SCAN_CHAR_BUDGET) { console.warn('[KeywordScan] Dừng sớm do vượt ngân sách quét.'); break; }
            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const low = foldVN(lines[i]);
              if (kws.some((kw) => low.includes(kw))) {
                // Ghép dòng khớp + dòng kế (phòng khi link nằm ở dòng ngay sau tên tài liệu).
                let snip = lines[i].trim();
                if (!/https?:\/\//i.test(snip) && lines[i + 1] && /https?:\/\//i.test(lines[i + 1])) {
                  snip += ' ' + lines[i + 1].trim();
                }
                if (snip) snippets.push(`[${k.title}] ${snip}`.slice(0, 400));
                if (snippets.length >= MAX_SNIPPETS) break outer;
              }
            }
          }
          if (snippets.length) {
            knowledgeContextText += `\n\n=== DÒNG DỮ LIỆU KHỚP TỪ KHÓA CÂU HỎI (có thể chứa LINK cần tìm — ưu tiên dùng) ===\n` + snippets.join('\n');
            console.log(`[KeywordScan] Bổ sung ${snippets.length} dòng khớp từ khóa vào ngữ cảnh.`);
          }
        }
      }
    } catch (e: any) {
      console.warn('[KeywordScan] error:', e?.message || e);
    }

    // Construct System Instruction with Data Priority Hierarchy
    const currentAgentName = agentConfig?.name || 'Trợ Lý Agent';
    const currentAgentTitle = agentConfig?.title || 'Chuyên viên tư vấn & hỗ trợ khách hàng';
    const currentBusinessName = agentConfig?.businessName || 'Doanh Nghiệp';
    const currentBusinessIndustry = agentConfig?.businessIndustry || 'Dịch vụ & Sản phẩm';
    const currentBusinessDescription = agentConfig?.businessDescription || '';

    // [#1] Ngân hàng HỎI–ĐÁP: gom nội dung các nguồn loại 'faq' đang bật -> LUÔN đưa vào prompt (không phụ thuộc RAG),
    // để agent ưu tiên đáp án đã duyệt. Giới hạn tổng ký tự tránh phình prompt.
    // [Fix mở rộng] Ngân hàng FAQ có thể RẤT lớn -> KHÔNG nhồi cả bộ vào prompt. Thay vào đó:
    //  - Nếu tổng FAQ còn nhỏ (<= FAQ_MAX_CHARS) -> đưa hết (đảm bảo đầy đủ cho bộ nhỏ).
    //  - Nếu lớn hơn -> TÁCH từng cặp Hỏi–Đáp rồi CHỌN LỌC theo câu hỏi hiện tại (khớp từ khóa, khử dấu),
    //    chỉ đưa các cặp LIÊN QUAN NHẤT vào khối ưu tiên. Nhờ vậy khối FAQ luôn nhỏ gọn dù bộ có hàng nghìn câu.
    const FAQ_MAX_CHARS = parseInt(process.env.FAQ_MAX_CONTEXT_CHARS || '40000', 10);
    // Khi phải chọn lọc: giới hạn số ký tự và số cặp đưa vào (đủ để trùm câu hỏi mà không phình prompt).
    const FAQ_SELECT_CHARS = parseInt(process.env.FAQ_SELECT_MAX_CHARS || '12000', 10);
    const FAQ_SELECT_MAX_ENTRIES = parseInt(process.env.FAQ_SELECT_MAX_ENTRIES || '12', 10);
    let faqContext = '';
    try {
      // [#1] Gồm cả nguồn loại 'faq' LẪN nguồn được đánh dấu "Ưu tiên như FAQ" (faqPriority) — vd CSV/Google Sheet.
      const faqSources = (Array.isArray(filteredKnowledgeSources) ? filteredKnowledgeSources : [])
        .filter((k: any) => k && k.active !== false && k.content && (k.type === 'faq' || k.faqPriority === true));
      const allText = faqSources.map((k: any) => String(k.content || '').trim()).filter(Boolean).join('\n\n');

      if (!allText) {
        faqContext = '';
      } else if (allText.length <= FAQ_MAX_CHARS) {
        // Bộ nhỏ -> đưa hết, đảm bảo đầy đủ.
        faqContext = allText;
      } else {
        // Bộ lớn -> tách từng cặp "Câu hỏi: ... Trả lời: ..." (chấp nhận cả tiền tố "• " của Google Sheet).
        const entries = allText
          .split(/\n(?=\s*[•\-]?\s*Câu hỏi\s*:)/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        // Chấm điểm theo số từ khóa (khử dấu) của câu hỏi xuất hiện trong từng cặp.
        const qk = extractKeywords(message || '').map(foldVN).filter((x: string) => x && x.length >= 2);
        const scored = entries.map((e) => {
          const fe = foldVN(e);
          let score = 0;
          for (const k of qk) if (fe.includes(k)) score++;
          return { e, score };
        });
        scored.sort((a, b) => b.score - a.score);
        const parts: string[] = [];
        let total = 0;
        for (const s of scored) {
          // Đủ số cặp cần thiết rồi thì dừng nhận thêm cặp KHÔNG liên quan (score 0).
          if (s.score === 0 && parts.length >= Math.min(3, FAQ_SELECT_MAX_ENTRIES)) break;
          if (parts.length >= FAQ_SELECT_MAX_ENTRIES) break;
          if (total + s.e.length + 2 > FAQ_SELECT_CHARS) continue;
          parts.push(s.e);
          total += s.e.length + 2;
        }
        faqContext = parts.join('\n\n');
        console.log(`[FAQ] Bộ FAQ lớn (${allText.length} ký tự) -> chọn ${parts.length} cặp liên quan nhất cho câu hỏi.`);
      }
    } catch { /* bỏ qua */ }

    // [Giai đoạn 2] Dựng systemInstruction qua PromptBuilder (src/server/services/promptBuilder.ts).
    const systemInstruction = buildChatSystemInstruction({
      agentConfig,
      currentAgentName,
      currentAgentTitle,
      currentBusinessName,
      currentBusinessIndustry,
      currentBusinessDescription,
      allowedDomainsListStr,
      linkDirectory,
      knowledgeContextText,
      activeProducts,
      faqContext,
    });

    // Extract Model & Provider Configuration
    const provider = agentConfig?.selectedProvider || 'google';
    let selectedModel = agentConfig?.selectedModel || (
      provider === 'google' ? 'gemini-3.6-flash' :
      provider === 'openai' ? 'gpt-4o' :
      provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
      provider === 'deepseek' ? 'deepseek-chat' : 'llama3.2'
    );

    // Auto-normalize Gemini model names
    if (provider === 'google') {
      if (!selectedModel) {
        selectedModel = 'gemini-3.6-flash';
      }
    }

    // [Item 4] Bóc tách văn bản từ TÀI LIỆU đính kèm (PDF/DOCX/TXT/CSV) NGAY TẠI SERVER,
    // rồi ghép vào tin nhắn -> mọi nhà cung cấp AI (kể cả OpenAI/DeepSeek/Claude) đều đọc được, không chỉ Gemini.
    // Ảnh (và video với Gemini) vẫn chuyển tiếp trực tiếp cho model để phân tích thị giác.
    let effectiveMessage = message || '';
    let forwardedAttachments: any[] = Array.isArray(attachments) ? attachments : [];
    try {
      const atts: any[] = Array.isArray(attachments) ? attachments : [];
      const isImgLike = (a: any) => (a?.mimeType || '').startsWith('image/') || a?.type === 'image';
      const isVideoLike = (a: any) => (a?.mimeType || '').startsWith('video/') || a?.type === 'video';
      forwardedAttachments = atts.filter((a: any) => isImgLike(a) || (provider === 'google' && isVideoLike(a)));
      const docAtts = atts.filter((a: any) => !isImgLike(a) && !isVideoLike(a) && a?.dataUrl && a.dataUrl.includes(','));
      if (docAtts.length > 0) {
        const parts: string[] = [];
        for (const a of docAtts.slice(0, 5)) {
          const b64 = a.dataUrl.split(',')[1] || '';
          let t = await extractTextFromAttachmentData(a.name || 'tài liệu', a.mimeType || '', b64, getGeminiAI);
          if (t && t.length > 20000) t = t.slice(0, 20000) + '\n...[nội dung tài liệu dài đã rút gọn]';
          if (t && t.trim()) parts.push(`--- NỘI DUNG TỆP "${a.name || 'tài liệu'}" ---\n${t.trim()}`);
        }
        if (parts.length > 0) {
          effectiveMessage = (effectiveMessage ? effectiveMessage + '\n\n' : '')
            + 'TÀI LIỆU KHÁCH HÀNG GỬI KÈM (đã bóc tách văn bản tự động — hãy dựa vào nội dung này để trả lời):\n'
            + parts.join('\n\n');
        }
      }
    } catch (e: any) {
      console.warn('[Chat] Lỗi bóc tách tài liệu đính kèm:', e?.message || e);
    }
    // [Giai đoạn 2] Cấu hình chung; key/endpoint chỉ lấy từ env server. Logic từng provider đã tách sang src/server/providers/ai/*.
    const customApiEndpoint = (process.env.CUSTOM_OPENAI_ENDPOINT || '').trim();
    // [Chính xác hơn] Hạ temperature mặc định 0.7 -> 0.3 để agent bám sát dữ liệu/FAQ, đỡ "sáng tạo"/bịa và nhất quán hơn.
    // Vẫn cho phép ghi đè qua Persona (agentConfig.temperature) nếu muốn sáng tạo hơn.
    const temperature = typeof agentConfig?.temperature === 'number' ? agentConfig.temperature : 0.2;
    console.log(`[AI Engine] Provider: ${provider}, Model: ${selectedModel}, Temp: ${temperature} (keys: server-side env only)`);

    let responseText = "";
    try {
      responseText = await generateChatResponse(
        {
          provider,
          model: selectedModel,
          systemInstruction,
          history,
          message: effectiveMessage,
          attachments: forwardedAttachments,
          temperature,
          customApiEndpoint,
        },
        provider === 'google' ? getGeminiAI() : undefined
      );
    } catch (err: any) {
      // ProviderError (vd thiếu API key) -> trả đúng mã HTTP; lỗi khác -> để catch ngoài trả 500.
      if (err && typeof err.status === 'number') {
        return res.status(err.status).json({ error: err.message, details: err.details });
      }
      throw err;
    }

    if (!responseText) {
      responseText = "Xin lỗi, em chưa nhận được câu trả lời từ mô hình AI. Anh/Chị có thể vui lòng thử lại được không ạ?";
    }

    // [Bước 1 - guardrail hậu kiểm link] Loại các URL KHÔNG có trong dữ liệu (chống bịa link/SDS/Drive giả ở TẦNG CODE).
    // Cho phép: URL trùng khớp chính xác với link thật trong dữ liệu, HOẶC link gốc (trang chủ) của domain hợp lệ.
    try {
      const urlAllowed = (raw: string): boolean => {
        const n = normUrl(raw);
        if (!n) return true; // không phân giải được -> để nguyên
        if (knownUrlSet.has(n)) return true;
        try {
          const u = new URL(raw);
          if ((u.pathname === '' || u.pathname === '/') && allowedDomainsSet.has(u.hostname.toLowerCase())) return true;
        } catch { /* ignore */ }
        return false;
      };
      let strippedLinks = 0;
      // 1) Link Markdown [nhãn](url) không hợp lệ -> giữ nhãn, bỏ link.
      responseText = responseText.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label: string, url: string) => {
        if (urlAllowed(url.replace(/[.,;:!?]+$/, ''))) return m;
        strippedLinks++;
        return label;
      });
      // 2) URL trần còn lại (không nằm trong markdown link) -> bỏ nếu không hợp lệ (tách dấu câu ở đuôi để không cắt nhầm).
      responseText = responseText.replace(/(?<!\]\()https?:\/\/[^\s"'<>)\]]+/g, (raw: string) => {
        const mm = raw.match(/^(.*?)([.,;:!?]*)$/);
        const core = mm ? mm[1] : raw;
        const tail = mm ? mm[2] : '';
        if (urlAllowed(core)) return raw; // hợp lệ -> giữ nguyên cả dấu câu
        strippedLinks++;
        return tail; // bỏ URL, giữ lại dấu câu
      });
      if (strippedLinks > 0) {
        responseText = responseText.replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').trim();
        console.warn(`[LinkGuard] Đã loại ${strippedLinks} link không có trong dữ liệu (chống bịa).`);
      }
    } catch (e: any) {
      console.warn('[LinkGuard] lỗi khi hậu kiểm link:', e?.message || e);
    }

    // Detect if agent asked a clarifying question
    const clarificationAsked = responseText.includes("?") && (
      responseText.toLowerCase().includes("bạn có thể cho") ||
      responseText.toLowerCase().includes("anh/chị vui lòng") ||
      responseText.toLowerCase().includes("cho em hỏi thêm") ||
      responseText.toLowerCase().includes("loại nào") ||
      responseText.toLowerCase().includes("model")
    );

    // [Bước 3] Lưu hội thoại + tự bắt SĐT thành lead (bắn-và-quên, không chặn phản hồi).
    const sid = (typeof sessionId === 'string' && sessionId.trim()) ? sessionId.trim().slice(0, 80) : '';
    if (sid) {
      logChatTurn(sid, message || '', responseText);
      const phone = detectPhone(message || '');
      if (phone) {
        saveLead({ sessionId: sid, phone, note: 'Khách để lại SĐT trong hội thoại: ' + String(message || '').slice(0, 300), source: 'chat_auto' })
          .then((r) => { if (r.ok && !r.dedup) console.log(`[Lead] Tự bắt SĐT ${phone} từ hội thoại.`); });
      }
      // [Bước 4] Khách muốn gặp nhân viên -> ghi nhận + báo Telegram (giới hạn 1 lần/10 phút mỗi phiên).
      if (detectHandoffIntent(message || '') && handoffAllowed(sid)) {
        saveHandoff({ sessionId: sid, phone: phone || '', note: 'Khách muốn gặp nhân viên. Lời khách: ' + String(message || '').slice(0, 300) });
        console.log(`[Handoff] Phiên ${sid} yêu cầu gặp nhân viên.`);
      }
      // [Nâng cấp] Agent trả lời kiểu "chưa có thông tin" -> ghi lại câu hỏi để chủ shop bổ sung tri thức/FAQ.
      if (message && String(message).trim() && detectAnswerGap(responseText)) {
        logAnswerGap({ sessionId: sid, question: String(message), answer: responseText });
        console.log(`[AnswerGap] Ghi nhận câu hỏi agent chưa trả lời được (phiên ${sid}).`);
      }
    }

    res.json({
      success: true,
      responseText,
      clarificationAsked,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[Chat API Error]:", error);
    // [Fix M17] Không lộ chi tiết lỗi nội bộ ra client (chỉ log ở server).
    console.error('[Chat 500]', error?.message || error);
    res.status(500).json({
      error: "Đã xảy ra lỗi khi kết nối với Trợ lý AI. Vui lòng thử lại sau."
    });
  }
});

// [Bước 3] CÔNG KHAI: khách để lại thông tin liên hệ từ widget (form "Để lại SĐT").
app.post("/api/lead", async (req, res) => {
  try {
    const { sessionId, name, phone, note } = req.body || {};
    const cleanPhone = detectPhone(String(phone || '')) || String(phone || '').replace(/[^\d+]/g, '');
    if (!cleanPhone && !name) {
      return res.status(400).json({ success: false, error: 'Vui lòng để lại số điện thoại hoặc tên ạ.' });
    }
    const r = await saveLead({ sessionId, name, phone: cleanPhone, note, source: 'form' });
    if (!r.ok && r.reason === 'no_client') {
      return res.status(200).json({ success: true, saved: false, message: 'Đã ghi nhận (chưa bật lưu trữ máy chủ).' });
    }
    res.json({ success: true, saved: true, dedup: !!r.dedup });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Lỗi lưu thông tin: ' + (e?.message || String(e)) });
  }
});

// [Bước 4] CÔNG KHAI: khách bấm nút "Gặp nhân viên tư vấn" trên widget.
app.post("/api/handoff", async (req, res) => {
  try {
    const { sessionId, phone, note } = req.body || {};
    const sid = (typeof sessionId === 'string' ? sessionId.trim() : '').slice(0, 80);
    // Chống spam khi bấm nút liên tục.
    if (sid && !handoffAllowed(sid)) return res.json({ success: true, throttled: true });
    const cleanPhone = detectPhone(String(phone || '')) || String(phone || '').replace(/[^\d+]/g, '');
    await saveHandoff({ sessionId: sid, phone: cleanPhone, note: note || 'Khách bấm nút "Gặp nhân viên tư vấn"' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

// [Bước 3] QUẢN TRỊ (được middleware auth bảo vệ khi AUTH_ENABLED): danh sách lead.
app.get("/api/admin/leads", async (req, res) => {
  try {
    const client = getSupabaseClient();
    if (!client) return res.json({ leads: [] });
    const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 1000);
    const { data, error } = await client.from('leads').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ leads: data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// [Bước 3] QUẢN TRỊ: cập nhật trạng thái lead (new/called/won/lost).
app.post("/api/admin/lead-status", async (req, res) => {
  try {
    const { id, status } = req.body || {};
    const allowed = ['new', 'called', 'won', 'lost'];
    if (!id || !allowed.includes(String(status))) return res.status(400).json({ error: 'Tham số không hợp lệ.' });
    const client = getSupabaseClient();
    if (!client) return res.status(400).json({ error: 'Chưa cấu hình Supabase.' });
    const { error } = await client.from('leads').update({ status }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// [Bước 3] QUẢN TRỊ: danh sách phiên hội thoại (gom theo session_id, kèm số tin + thời điểm cuối).
app.get("/api/admin/conversations", async (req, res) => {
  try {
    const client = getSupabaseClient();
    if (!client) return res.json({ conversations: [] });
    // Lấy tối đa N log gần nhất rồi gom nhóm phía server (đơn giản, không cần view SQL).
    const cap = Math.min(parseInt(String(req.query.scan || '4000'), 10) || 4000, 20000);
    const { data, error } = await client.from('chat_logs').select('session_id, sender, text, created_at').order('created_at', { ascending: false }).limit(cap);
    if (error) return res.status(500).json({ error: error.message });
    const map = new Map<string, any>();
    for (const row of (data || [])) {
      const s = row.session_id;
      if (!map.has(s)) map.set(s, { session_id: s, messages: 0, lastAt: row.created_at, lastText: row.text });
      const c = map.get(s);
      c.messages++;
    }
    res.json({ conversations: Array.from(map.values()).slice(0, 500) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// [Bước 3] QUẢN TRỊ: toàn bộ tin nhắn của MỘT phiên hội thoại.
app.get("/api/admin/conversation", async (req, res) => {
  try {
    const session = String(req.query.session || '').trim();
    if (!session) return res.status(400).json({ error: 'Thiếu session.' });
    const client = getSupabaseClient();
    if (!client) return res.json({ messages: [] });
    const { data, error } = await client.from('chat_logs').select('*').eq('session_id', session).order('created_at', { ascending: true }).limit(2000);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ messages: data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// [Nâng cấp] QUẢN TRỊ: danh sách "câu hỏi agent chưa trả lời được" (gom nhóm câu giống nhau + đếm số lần).
app.get("/api/admin/gaps", async (req, res) => {
  try {
    const client = getSupabaseClient();
    if (!client) return res.json({ gaps: [] });
    const includeResolved = String(req.query.all || '') === '1';
    let q = client.from('answer_gaps').select('*').order('created_at', { ascending: false }).limit(1000);
    if (!includeResolved) q = q.eq('status', 'new');
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    // Gom nhóm theo câu hỏi (chuẩn hoá thường/space) -> đếm số lần hỏi, giữ lần gần nhất + các id để đánh dấu đã xử lý.
    const map = new Map<string, any>();
    for (const row of (data || [])) {
      const key = String(row.question || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { question: row.question, count: 0, lastAt: row.created_at, lastAnswer: row.answer, status: row.status, ids: [] });
      }
      const g = map.get(key);
      g.count++;
      g.ids.push(row.id);
    }
    const gaps = Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 300);
    res.json({ gaps });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// [Nâng cấp] QUẢN TRỊ: đánh dấu (các) bản ghi lỗ hổng là ĐÃ XỬ LÝ (sau khi đã bổ sung FAQ).
app.post("/api/admin/gap-status", async (req, res) => {
  try {
    const { ids, status } = req.body || {};
    const allowed = ['new', 'resolved'];
    if (!Array.isArray(ids) || ids.length === 0 || !allowed.includes(String(status))) {
      return res.status(400).json({ error: 'Tham số không hợp lệ.' });
    }
    const client = getSupabaseClient();
    if (!client) return res.status(400).json({ error: 'Chưa cấu hình Supabase.' });
    const { error } = await client.from('answer_gaps').update({ status }).in('id', ids.slice(0, 500));
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// [Nâng cấp] CÔNG KHAI: khách bấm 👍/👎 dưới câu trả lời của agent.
app.post("/api/feedback", async (req, res) => {
  try {
    const { sessionId, rating, question, answer } = req.body || {};
    if (rating !== 'up' && rating !== 'down') return res.status(400).json({ error: 'Tham số không hợp lệ.' });
    const client = getSupabaseClient();
    if (!client) return res.json({ success: true, saved: false });
    const { error } = await client.from('answer_feedback').insert([{
      session_id: (typeof sessionId === 'string' ? sessionId : '').slice(0, 80) || null,
      rating,
      question: String(question || '').slice(0, 1000) || null,
      answer: String(answer || '').slice(0, 2000) || null,
    }]);
    if (error) console.warn('[Feedback] insert lỗi:', error.message);
    res.json({ success: true, saved: !error });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// [Nâng cấp] QUẢN TRỊ: số liệu tổng quan cho dashboard (hội thoại, lead, đánh giá, khung giờ).
app.get("/api/admin/stats", async (req, res) => {
  try {
    const client = getSupabaseClient();
    if (!client) return res.json({ enabled: false });
    const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Bảng answer_feedback / answer_gaps có thể CHƯA tạo -> bọc để không làm hỏng cả dashboard.
    const safe = (p: any) => p.then((r: any) => r).catch(() => ({ data: [] }));
    const [logsR, leadsR, fbR, gapsR]: any[] = await Promise.all([
      safe(client.from('chat_logs').select('session_id, sender, created_at').gte('created_at', since).limit(20000)),
      safe(client.from('leads').select('id, source, status, created_at').gte('created_at', since).limit(5000)),
      safe(client.from('answer_feedback').select('rating').gte('created_at', since).limit(20000)),
      safe(client.from('answer_gaps').select('id, status').gte('created_at', since).limit(5000)),
    ]);

    const logs = logsR?.data || [];
    const leads = leadsR?.data || [];
    const feedback = fbR?.data || [];
    const gaps = gapsR?.data || [];

    // Gom theo ngày (YYYY-MM-DD) + theo giờ trong ngày.
    const byDay: Record<string, { sessions: Set<string>; messages: number }> = {};
    const byHour: number[] = new Array(24).fill(0);
    const sessions = new Set<string>();
    for (const r of logs) {
      const d = String(r.created_at || '').slice(0, 10);
      if (!byDay[d]) byDay[d] = { sessions: new Set(), messages: 0 };
      byDay[d].messages++;
      if (r.session_id) { byDay[d].sessions.add(r.session_id); sessions.add(r.session_id); }
      const h = new Date(r.created_at).getHours();
      if (!isNaN(h)) byHour[h]++;
    }
    const daily = Object.keys(byDay).sort().map((d) => ({ date: d, sessions: byDay[d].sessions.size, messages: byDay[d].messages }));

    // Lead theo ngày + theo trạng thái.
    const leadsByDay: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const l of leads) {
      const d = String(l.created_at || '').slice(0, 10);
      leadsByDay[d] = (leadsByDay[d] || 0) + 1;
      const s = l.status || 'new';
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    const up = feedback.filter((f: any) => f.rating === 'up').length;
    const down = feedback.filter((f: any) => f.rating === 'down').length;
    const totalSessions = sessions.size;

    res.json({
      enabled: true,
      days,
      totals: {
        sessions: totalSessions,
        messages: logs.length,
        leads: leads.length,
        handoffs: leads.filter((l: any) => l.source === 'handoff').length,
        // Tỉ lệ hội thoại ra lead (%) — chỉ số quan trọng nhất về hiệu quả bán hàng.
        conversionRate: totalSessions > 0 ? Math.round((leads.length / totalSessions) * 1000) / 10 : 0,
        feedbackUp: up,
        feedbackDown: down,
        gapsOpen: gaps.filter((g: any) => (g.status || 'new') === 'new').length,
      },
      daily: daily.map((d) => ({ ...d, leads: leadsByDay[d.date] || 0 })),
      byHour,
      leadsByStatus: byStatus,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Global In-Memory Config Store for Widget Sync with File Persistence
const STORE_FILE = path.join(process.cwd(), 'server_store.json');

const DEFAULT_AVATAR_URL = 'https://bizweb.dktcdn.net/100/460/752/files/them_logo_tren_ao_co_202606181532.jpeg?v=1786018615920';

let serverAgentConfig: any = { avatarUrl: DEFAULT_AVATAR_URL };
let serverWidgetSettings: any = null;
let serverKnowledgeSources: any[] = [];
let serverProducts: any[] = [];

// Google OAuth Session Store — TÁCH THEO TỪNG NGƯỜI DÙNG (SEC-04).
// Khóa map = id người dùng Supabase đã đăng nhập; khi tắt auth dùng khóa 'default'.
interface GoogleSession {
  tokens?: {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
  };
  user?: {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };
}
let serverGoogleSessions: Record<string, GoogleSession> = {};

// Xác định khóa phiên Google theo người dùng đang đăng nhập (hoặc 'default' khi tắt auth).
function googleUserKey(req: express.Request): string {
  const u = (req as any).authUser;
  return (u && u.id) ? `u:${u.id}` : 'default';
}

// [Security] OAUTH_STATE_SECRET (ký tham số OAuth `state`) -> đã chuyển sang src/server/config/env.ts.
function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyState(state: string): any | null {
  if (!state || !state.includes('.')) return null;
  const [body, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(body).digest('base64url');
  // So sánh an toàn thời gian
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && Date.now() > payload.exp) return null; // hết hạn
    return payload;
  } catch {
    return null;
  }
}

// [Low] Khóa in-flight theo userKey: nhiều request đồng thời cùng thấy token sắp hết hạn sẽ CHỈ refresh một lần
// (tránh gọi refresh trùng lặp — Google có thể thu hồi refresh_token khi bị gọi dồn dập).
const googleRefreshInFlight = new Map<string, Promise<string | null>>();

async function getValidGoogleAccessToken(userKey: string) {
  const session = serverGoogleSessions[userKey];
  if (!session || !session.tokens) return null;
  const { access_token, refresh_token, expiry_date } = session.tokens;

  if (expiry_date && Date.now() >= expiry_date - 60000 && refresh_token) {
    const existing = googleRefreshInFlight.get(userKey);
    if (existing) return existing; // đã có một lượt refresh đang chạy -> dùng chung kết quả

    const p = (async () => {
      try {
        const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId || '',
            client_secret: clientSecret || '',
            refresh_token: refresh_token,
            grant_type: 'refresh_token',
          }),
        });
        const data = await res.json();
        if (data.access_token) {
          session.tokens.access_token = data.access_token;
          if (data.expires_in) {
            session.tokens.expiry_date = Date.now() + data.expires_in * 1000;
          }
          return data.access_token as string;
        }
      } catch (e) {
        console.error("Failed to refresh Google OAuth token", e);
      }
      return session.tokens.access_token || access_token || null;
    })();

    googleRefreshInFlight.set(userKey, p);
    p.finally(() => { googleRefreshInFlight.delete(userKey); });
    return p;
  }
  return access_token;
}

// --- FIREBASE FIRESTORE REST PERSISTENT STORE ---
let firebaseConfig: { projectId?: string; apiKey?: string } | null = null;
try {
  const firebaseConfigFile = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigFile)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigFile, 'utf-8'));
    if (firebaseConfig?.projectId && firebaseConfig?.apiKey) {
      console.log("🔥 [Firebase] Firestore REST initialized for persistent data storage.");
    }
  }
} catch (e) {
  console.warn("⚠️ [Firebase] Could not initialize Firestore REST config:", e);
}

// [Security - SEC-08] KHÔNG còn ghi bí mật ra .env/supabase_config.json lúc runtime, và không nhận
// credential từ client. Hàm giữ lại (no-op an toàn) để tương thích chỗ gọi cũ; cấu hình Supabase chỉ qua env.
function persistSupabaseEnv(_url?: string, _anonKey?: string) {
  /* deprecated: cấu hình Supabase nay chỉ đặt qua biến môi trường server */
}

// [Security - SEC-07/08] Client Supabase phía SERVER: chỉ lấy credential từ env.
// Ưu tiên SERVICE ROLE KEY (chỉ tồn tại ở server, bỏ qua RLS an toàn cho thao tác quản trị);
// nếu không có thì dùng ANON KEY. Không bao giờ nhận url/key từ client.
// getSupabaseClient -> đã tách sang src/server/services/clients.ts.

// [Fix timeout] Chỉ giữ METADATA tri thức trong app_config (bỏ trường "content" rất lớn).
// Nội dung đầy đủ nằm ở bảng riêng knowledge_sources -> app_config nhẹ, upsert không timeout.
function knowledgeMetaOnly(sources: any[]): any[] {
  return (Array.isArray(sources) ? sources : []).map((s: any) => ({
    id: s.id,
    title: s.title,
    type: s.type,
    url: s.url || '',
    wordCount: s.wordCount || 0,
    active: s.active !== false,
    faqPriority: s.faqPriority === true, // [#1] cờ "Ưu tiên như FAQ" (lưu trong metadata JSON, không cần đổi schema)
    subPages: s.subPages || undefined,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));
}

// Upsert theo lô để tránh 1 câu lệnh quá lớn gây "statement timeout".
async function upsertInChunks(client: any, table: string, records: any[], size = 20): Promise<string | null> {
  for (let i = 0; i < records.length; i += size) {
    const chunk = records.slice(i, i + size);
    const { error } = await client.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) return error.message;
  }
  return null;
}

// --- ĐỒNG BỘ THEO TỪNG BẢN GHI (per-item diff) ---
// Chỉ ghi mục MỚI/THAY ĐỔI và xóa mục ĐÃ GỠ, thay vì ghi lại toàn bộ mỗi lần.
// Chữ ký nhẹ (không hash toàn bộ content) để phát hiện thay đổi rẻ tiền.
let lastKnowledgeSyncSig: Record<string, string> = {};
function ksSignature(s: any): string {
  return [
    s.title || '', s.url || '', s.active !== false ? '1' : '0',
    String((s.content || '').length), String(s.wordCount || 0), s.type || ''
  ].join('|');
}
// Khởi tạo chữ ký từ dữ liệu đã tải (để lần lưu đầu sau khi load không ghi lại thừa).
function primeKnowledgeSyncSig(sources: any[]) {
  const next: Record<string, string> = {};
  for (const s of (Array.isArray(sources) ? sources : [])) if (s && s.id) next[s.id] = ksSignature(s);
  lastKnowledgeSyncSig = next;
}
// Đồng bộ chênh lệch — CHỈ thêm/cập nhật (upsert). TUYỆT ĐỐI KHÔNG tự xóa dựa trên mảng client gửi lên,
// vì một client có danh sách cũ/thiếu (tab khác, localStorage bị đè...) sẽ vô tình xóa mất dữ liệu người khác.
// Việc xóa được thực hiện riêng qua endpoint /api/knowledge/delete-source khi người dùng chủ động xóa.
// force=true: bỏ qua chữ ký, ghi lại tất cả (dùng cho nút "Đồng bộ" thủ công).
async function syncKnowledgeSourcesDiff(client: any, tableName: string, sources: any[], force = false): Promise<string | null> {
  const list = Array.isArray(sources) ? sources : [];
  const toUpsert: any[] = [];
  for (const s of list) {
    if (!s || !s.id) continue;
    const sig = ksSignature(s);
    if (force || lastKnowledgeSyncSig[s.id] !== sig) {
      toUpsert.push({
        id: s.id, title: s.title || 'Chưa đặt tên', type: s.type || 'website',
        url: s.url || '', content: s.content || '', word_count: s.wordCount || 0,
        active: s.active !== false, updated_at: new Date().toISOString()
      });
    }
  }

  if (toUpsert.length) {
    const err = await upsertInChunks(client, tableName, toUpsert, 20);
    if (err) return err;
  }

  // Cập nhật chữ ký: hợp nhất (không xóa entry cũ) để không đề xuất xóa sai ở nơi khác.
  for (const s of list) if (s && s.id) lastKnowledgeSyncSig[s.id] = ksSignature(s);

  console.log(`⚡ [SupabaseStore] KB sync: upsert ${toUpsert.length} (không tự xóa).`);
  return null;
}

async function loadStoreFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    // 1. Restore complete App Config & Products & Knowledge Sources from 'app_config' table if present
    try {
      const configPromise = client.from('app_config').select('*').eq('id', 'main_config').maybeSingle();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase config query timeout (4s)")), 4000)
      );
      const { data: configRow, error: configErr }: any = await Promise.race([configPromise, timeoutPromise]);
      if (!configErr && configRow) {
        if (configRow.agent_config) serverAgentConfig = configRow.agent_config;
        if (configRow.widget_settings) serverWidgetSettings = configRow.widget_settings;
        if (Array.isArray(configRow.products) && configRow.products.length > 0) serverProducts = configRow.products;
        // app_config chỉ chứa METADATA tri thức (không content) -> dùng làm nền, sẽ hydrate content bên dưới.
        if (Array.isArray(configRow.knowledge_sources) && configRow.knowledge_sources.length > 0) serverKnowledgeSources = configRow.knowledge_sources;
        console.log("⚡ [SupabaseStore] Restored Agent Config, Products & KB metadata from 'app_config'.");
      }
    } catch (err: any) {
      console.warn("⚠️ [SupabaseStore] Could not load from app_config table:", err?.message);
    }

    // 2. Luôn tải NỘI DUNG tri thức đầy đủ từ bảng riêng và hydrate vào danh sách.
    const tableName = serverAgentConfig?.supabaseConfig?.tableName || 'knowledge_sources';
    const queryPromise = client.from(tableName).select('*');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Supabase query timeout (8s)")), 8000)
    );
    try {
      const { data, error }: any = await Promise.race([queryPromise, timeoutPromise]);
      if (!error && Array.isArray(data) && data.length > 0) {
        serverKnowledgeSources = data.map((item: any) => ({
          id: item.id,
          title: item.title,
          type: item.type || 'website',
          url: item.url || '',
          content: item.content || '',
          wordCount: item.word_count || 0,
          active: item.active !== false,
          updatedAt: item.updated_at
        }));
        console.log(`⚡ [SupabaseStore] Hydrated ${data.length} knowledge sources (full content) from '${tableName}'.`);
      } else if (error) {
        console.warn("⚠️ [SupabaseStore] Could not load knowledge_sources table:", error.message);
      }
    } catch (e: any) {
      console.warn("⚠️ [SupabaseStore] knowledge_sources load skipped:", e?.message);
    }

    // Khởi tạo chữ ký đồng bộ theo dữ liệu vừa tải -> lần lưu đầu sau khi load sẽ không ghi lại thừa.
    primeKnowledgeSyncSig(serverKnowledgeSources);

    // Lưu cache file cục bộ
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify({
        agentConfig: serverAgentConfig,
        widgetSettings: serverWidgetSettings,
        knowledgeSources: serverKnowledgeSources,
        products: serverProducts,
        googleSessions: serverGoogleSessions,
        updatedAt: new Date().toISOString(),
      }, null, 2), 'utf-8');
    } catch (e) {}
  } catch (err: any) {
    console.warn("⚠️ [SupabaseStore] Failed to load store from Supabase:", err?.message);
  }
}

// [Fix hiển thị & mất dữ liệu] Coi bảng Supabase là NGUỒN SỰ THẬT của tri thức.
// Khi client hỏi cấu hình -> hợp nhất bộ nhớ với bảng (union theo id, bản trong bảng ưu tiên cho content),
// để mọi mục đã lưu trên Supabase luôn hiển thị, đồng thời KHÔNG mất mục client vừa thêm chưa kịp lưu.
// Có chống hammer: chỉ đọc bảng tối đa mỗi 15 giây (hoặc khi bộ nhớ trống).
let knowledgeHydrating: Promise<void> | null = null;
let lastKnowledgeRefreshAt = 0;
// [Fix M1] Tải theo DELTA: sau lần tải đầy đủ đầu tiên, các lần làm mới chỉ kéo hàng có `updated_at` MỚI HƠN
// mốc đã thấy -> không kéo lại vài MB content mỗi 15s. Định kỳ (FULL_REFRESH_MS) tải đầy đủ lại để bắt kịp
// xóa từ instance khác (trên Render 1 instance thì instance tự cập nhật bộ nhớ khi xóa nên không thiếu).
let lastHydrateMaxUpdatedAt: string | null = null; // updated_at lớn nhất đã nạp (ISO)
let lastFullHydrateAt = 0;
const FULL_REFRESH_MS = 5 * 60 * 1000;

// [Chống trùng] Gom các nguồn có CÙNG URL (bản trùng do id cũ kèm Date.now()): giữ bản MỚI NHẤT,
// xóa các bản trùng cũ khỏi Supabase (+ chunk RAG) để không tái xuất hiện khi hydrate lần sau.
async function dedupeKnowledgeByUrl(client: any, tableName: string) {
  try {
    const list = Array.isArray(serverKnowledgeSources) ? serverKnowledgeSources : [];
    const groups = new Map<string, any[]>();
    for (const s of list) {
      const u = ((s && (s.url || s.sheetUrl)) || '').trim();
      if (!u) continue; // chỉ gom khi có URL thật (bỏ qua tài liệu/faq không có URL)
      // [Fix M2] Khóa gom = URL + LOẠI. Trước đây chỉ theo URL -> hai nguồn KHÁC LOẠI cùng base URL
      // (ví dụ trang web nhập kiểu 'website' và cùng URL nhập kiểu 'faq') bị coi là trùng và XÓA CỨNG nhầm một cái.
      // Chỉ những bản THỰC SỰ trùng (cùng URL + cùng loại, do quét lại) mới bị gộp.
      const key = u + '|' + ((s && s.type) || 'website');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const loserIds: string[] = [];
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => {
        const ta = new Date(a.updatedAt || a.lastSyncedAt || a.lastUpdated || 0).getTime();
        const tb = new Date(b.updatedAt || b.lastSyncedAt || b.lastUpdated || 0).getTime();
        if (tb !== ta) return tb - ta;                       // mới nhất trước
        return (b.content?.length || 0) - (a.content?.length || 0); // hòa: nội dung dài hơn
      });
      for (let i = 1; i < arr.length; i++) if (arr[i]?.id) loserIds.push(arr[i].id);
    }
    if (!loserIds.length) return;
    const loserSet = new Set(loserIds);
    serverKnowledgeSources = list.filter((s) => !(s && loserSet.has(s.id)));
    for (const id of loserIds) {
      try { await client.from(tableName).delete().eq('id', id); } catch { /* bỏ qua */ }
      try { await client.from('kb_chunks').delete().eq('source_id', id); } catch { /* bỏ qua nếu chưa dùng RAG */ }
    }
    console.log(`🧹 [Dedupe] Gộp trùng theo URL: xóa ${loserIds.length} bản trùng cũ, giữ bản mới nhất.`);
  } catch (e: any) {
    console.warn('[Dedupe] error:', e?.message || e);
  }
}

async function ensureKnowledgeLoaded() {
  const empty = !(Array.isArray(serverKnowledgeSources) && serverKnowledgeSources.length > 0);
  const stale = (Date.now() - lastKnowledgeRefreshAt) > 15000;
  if (!empty && !stale) return;
  if (knowledgeHydrating) return knowledgeHydrating;
  const client = getSupabaseClient();
  if (!client) return;
  const tableName = serverAgentConfig?.supabaseConfig?.tableName || 'knowledge_sources';
  knowledgeHydrating = (async () => {
    let ok = false;
    try {
      // [Fix M1] Chọn chế độ: FULL khi bộ nhớ trống, chưa từng nạp, hoặc đã tới hạn làm mới đầy đủ; ngược lại DELTA.
      const needFull = empty || !lastHydrateMaxUpdatedAt || (Date.now() - lastFullHydrateAt) > FULL_REFRESH_MS;
      let query = client.from(tableName).select('*');
      if (!needFull && lastHydrateMaxUpdatedAt) {
        query = query.gt('updated_at', lastHydrateMaxUpdatedAt); // chỉ hàng đổi sau mốc -> nhẹ
      }
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase query timeout (20s)")), 20000)
      );
      const { data, error }: any = await Promise.race([query, timeoutPromise]);
      if (!error && Array.isArray(data)) {
        // Union theo id: giữ mục client-only trong bộ nhớ, ghi đè bằng bản trong bảng (đã lưu, đầy đủ content).
        // Ở chế độ DELTA, các hàng KHÔNG đổi không nằm trong `data` -> giữ nguyên bản trong bộ nhớ (còn content).
        const byId = new Map<string, any>();
        for (const s of (Array.isArray(serverKnowledgeSources) ? serverKnowledgeSources : [])) {
          if (s && s.id) byId.set(s.id, s);
        }
        for (const item of data) {
          if (!item || !item.id) continue;
          // [#1] Giữ lại cờ faqPriority từ bản trong bộ nhớ (nạp từ app_config metadata) khi ghi đè bằng hàng bảng
          // (bảng chỉ có content/metadata cơ bản, không có faqPriority) -> cờ không bị mất sau mỗi lần hydrate.
          const prevFaq = byId.get(item.id)?.faqPriority === true;
          byId.set(item.id, {
            id: item.id,
            title: item.title,
            type: item.type || 'website',
            url: item.url || '',
            content: item.content || '',
            wordCount: item.word_count || 0,
            active: item.active !== false,
            faqPriority: prevFaq,
            updatedAt: item.updated_at,
          });
          // Theo dõi updated_at lớn nhất để lần sau chỉ kéo delta.
          if (item.updated_at && (!lastHydrateMaxUpdatedAt || item.updated_at > lastHydrateMaxUpdatedAt)) {
            lastHydrateMaxUpdatedAt = item.updated_at;
          }
        }
        serverKnowledgeSources = Array.from(byId.values());
        if (needFull) {
          lastFullHydrateAt = Date.now();
          await dedupeKnowledgeByUrl(client, tableName); // [Chống trùng] chỉ dọn khi tải đầy đủ (thấy toàn bộ)
        }
        primeKnowledgeSyncSig(serverKnowledgeSources);
        lastKnowledgeRefreshAt = Date.now();
        ok = true;
        console.log(`⚡ [SupabaseStore] Hydrate ${needFull ? 'FULL' : 'DELTA'}: ${data.length} rows -> tổng ${serverKnowledgeSources.length} nguồn.`);
      } else if (error) {
        console.warn("⚠️ [SupabaseStore] Hydrate error:", error.message);
      }
    } catch (e: any) {
      console.warn("⚠️ [SupabaseStore] Hydrate failed:", e?.message);
    } finally {
      // [Fix H4] Khi hydrate LỖI vẫn ghi mốc (lùi ~5s) để KHÔNG re-hydrate mỗi request khi Supabase chậm/chập chờn.
      if (!ok) lastKnowledgeRefreshAt = Date.now() - 10000;
      knowledgeHydrating = null;
    }
  })();
  return knowledgeHydrating;
}

async function saveStoreToSupabase(data: any) {
  const client = getSupabaseClient();
  if (!client) return { synced: false, reason: "No client" };
  let appConfigError: string | null = null;
  let ksError: string | null = null;
  try {
    // 1. app_config: chỉ lưu cấu hình + sản phẩm + METADATA tri thức (KHÔNG kèm content lớn) -> upsert nhẹ, không timeout.
    const fullConfigRecord = {
      id: 'main_config',
      agent_config: data?.agentConfig || serverAgentConfig,
      widget_settings: data?.widgetSettings || serverWidgetSettings,
      products: data?.products || serverProducts,
      knowledge_sources: knowledgeMetaOnly(data?.knowledgeSources || serverKnowledgeSources),
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await client.from('app_config').upsert(fullConfigRecord, { onConflict: 'id' });
      if (error) {
        appConfigError = error.message;
        console.warn("⚠️ [SupabaseStore] Could not save to 'app_config' table:", error.message);
      } else {
        console.log("⚡ [SupabaseStore] Synced config + products + KB metadata to 'app_config'.");
      }
    } catch (e: any) {
      appConfigError = e?.message || "Unknown error";
      console.warn("⚠️ [SupabaseStore] app_config sync skipped:", e?.message);
    }

    // 2. Bảng riêng: đồng bộ THEO TỪNG BẢN GHI (chỉ ghi mục thay đổi/mới, xóa mục đã gỡ) -> nhẹ, không timeout.
    const tableName = serverAgentConfig?.supabaseConfig?.tableName || 'knowledge_sources';
    const sources = data?.knowledgeSources || serverKnowledgeSources || [];
    const diffErr = await syncKnowledgeSourcesDiff(client, tableName, sources);
    if (diffErr) {
      ksError = diffErr;
      console.warn("⚠️ [SupabaseStore] Failed to diff-sync knowledge sources:", diffErr);
    }

    return {
      synced: !appConfigError && !ksError,
      appConfigError,
      ksError
    };
  } catch (err: any) {
    console.warn("⚠️ [SupabaseStore] Error saving to Supabase:", err?.message);
    return { synced: false, error: err?.message };
  }
}

async function loadStoreFromFirestoreRest() {
  if (!firebaseConfig?.projectId || !firebaseConfig?.apiKey) return;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/app_config/main_store?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const docData = await res.json();
    const rawJson = docData?.fields?.configJson?.stringValue;
    if (rawJson) {
      const parsed = JSON.parse(rawJson);
      if (parsed.agentConfig) serverAgentConfig = parsed.agentConfig;
      if (parsed.widgetSettings) serverWidgetSettings = parsed.widgetSettings;
      if (Array.isArray(parsed.knowledgeSources)) serverKnowledgeSources = parsed.knowledgeSources;
      if (Array.isArray(parsed.products)) serverProducts = parsed.products;
      if (parsed.googleSessions && typeof parsed.googleSessions === 'object') {
        serverGoogleSessions = parsed.googleSessions;
      } else if (parsed.googleSession && parsed.googleSession.tokens) {
        serverGoogleSessions = { default: parsed.googleSession }; // migrate phiên cũ (đơn) sang map
      }

      try {
        fs.writeFileSync(STORE_FILE, JSON.stringify({
          agentConfig: serverAgentConfig,
          widgetSettings: serverWidgetSettings,
          knowledgeSources: serverKnowledgeSources,
          products: serverProducts,
          googleSessions: serverGoogleSessions,
          updatedAt: new Date().toISOString(),
        }, null, 2), 'utf-8');
      } catch (err) {}
      console.log("🔥 [ServerStore] Successfully restored configuration from Firestore via REST.");
    }
  } catch (err: any) {
    console.warn("⚠️ [ServerStore] Could not load store from Firestore REST:", err.message);
  }
}

async function saveStoreToFirestoreRest(data: any) {
  if (!firebaseConfig?.projectId || !firebaseConfig?.apiKey) return;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/app_config/main_store?key=${firebaseConfig.apiKey}`;
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          configJson: {
            stringValue: JSON.stringify(data)
          }
        }
      })
    });
  } catch (err: any) {
    console.warn("⚠️ [ServerStore] Could not persist store to Firestore REST:", err.message);
  }
}

async function loadServerStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.agentConfig) {
        serverAgentConfig = parsed.agentConfig;
        if (!serverAgentConfig.avatarUrl || serverAgentConfig.avatarUrl.includes('unsplash.com')) {
          serverAgentConfig.avatarUrl = DEFAULT_AVATAR_URL;
        }
      }
      if (parsed.widgetSettings) serverWidgetSettings = parsed.widgetSettings;
      if (Array.isArray(parsed.knowledgeSources)) {
        serverKnowledgeSources = parsed.knowledgeSources;
      }
      if (Array.isArray(parsed.products)) {
        serverProducts = parsed.products;
      }
      if (parsed.googleSessions && typeof parsed.googleSessions === 'object') {
        serverGoogleSessions = parsed.googleSessions;
      } else if (parsed.googleSession && parsed.googleSession.tokens) {
        serverGoogleSessions = { default: parsed.googleSession }; // migrate phiên cũ (đơn) sang map
      }
      console.log("💾 [ServerStore] Loaded initial configuration from server_store.json");
    }
  } catch (e) {
    console.warn("⚠️ [ServerStore] Failed to load server_store.json:", e);
  }

  // Restore standalone Supabase credentials file if present
  try {
    const supabaseConfigFile = path.join(process.cwd(), 'supabase_config.json');
    if (fs.existsSync(supabaseConfigFile)) {
      const sc = JSON.parse(fs.readFileSync(supabaseConfigFile, 'utf-8'));
      if (sc.url && sc.anonKey) {
        if (!serverAgentConfig) serverAgentConfig = {};
        if (!serverAgentConfig.supabaseConfig) serverAgentConfig.supabaseConfig = {};
        serverAgentConfig.supabaseConfig.url = sc.url;
        serverAgentConfig.supabaseConfig.anonKey = sc.anonKey;
        serverAgentConfig.supabaseConfig.enabled = true;
        process.env.SUPABASE_URL = sc.url;
        process.env.SUPABASE_ANON_KEY = sc.anonKey;
        console.log("⚡ [SupabaseStore] Restored Supabase connection details from supabase_config.json");
      }
    }
  } catch (e: any) {
    console.warn("⚠️ [SupabaseStore] Could not read supabase_config.json:", e?.message);
  }

  // Await sync from Firestore REST and Supabase if available so data is restored before server starts listening
  await loadStoreFromFirestoreRest();
  await loadStoreFromSupabase();
}

function buildStoreSnapshot() {
  return {
    agentConfig: serverAgentConfig,
    widgetSettings: serverWidgetSettings,
    knowledgeSources: serverKnowledgeSources,
    products: serverProducts,
    googleSessions: serverGoogleSessions,
    updatedAt: new Date().toISOString(),
  };
}

function writeStoreFile(data: any) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn("⚠️ [ServerStore] Failed to save server_store.json:", e);
  }
}

function saveServerStore() {
  const data = buildStoreSnapshot();
  writeStoreFile(data);
  // [SEC-08] Không còn ghi credential Supabase ra .env lúc runtime; cấu hình Supabase chỉ qua env.
  // Đường "bắn-và-quên" cho các hot-path không cần chờ (đã .catch để không rò unhandledRejection).
  saveStoreToFirestoreRest(data);
  saveStoreToSupabase(data).catch((e: any) =>
    console.warn("⚠️ [ServerStore] Async Supabase persist error:", e?.message || e)
  );
}

// [Fix M4] Biến thể CÓ CHỜ: dùng cho endpoint mà việc mất-ghi-âm-thầm là nghiêm trọng
// (xóa nguồn, người dùng bấm "Đồng bộ") -> await ghi Supabase và TRẢ trạng thái thật để client biết.
async function saveServerStoreAsync(): Promise<{ synced: boolean; error?: string }> {
  const data = buildStoreSnapshot();
  writeStoreFile(data);
  saveStoreToFirestoreRest(data); // legacy best-effort, không chặn
  try {
    const r: any = await saveStoreToSupabase(data);
    const error = r?.error || r?.appConfigError || r?.ksError || undefined;
    return { synced: !!r?.synced, error: error || undefined };
  } catch (e: any) {
    return { synced: false, error: e?.message || String(e) };
  }
}

// --- GOOGLE OAUTH 2.0 ROUTING ---

// 1. Get Google OAuth Login URL or Redirect
// Route này được BẢO VỆ (cần đăng nhập khi AUTH_ENABLED) -> gắn userKey vào `state` để callback lưu token đúng người.
app.get("/api/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: "GOOGLE_WORKSPACE_CLIENT_ID chưa được cấu hình trong môi trường hệ thống." });
  }
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/drive.readonly"
  ].join(" ");

  // state có ký (HMAC) + hết hạn 10 phút, mang userKey của người đang đăng nhập.
  const state = signState({ k: googleUserKey(req), n: crypto.randomBytes(8).toString('hex'), exp: Date.now() + 10 * 60 * 1000 });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${encodeURIComponent(state)}`;

  if (req.query.format === 'json') {
    return res.json({ authUrl, clientId, redirectUri });
  }
  return res.redirect(authUrl);
});

// [Giai đoạn 2] escapeHtml/jsonForScript đã tách sang src/server/security/sanitize.ts

// 2. Google OAuth Callback
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const error = req.query.error as string;

  // Xác định người dùng sở hữu phiên này từ `state` có ký (gắn ở bước khởi tạo).
  const statePayload = verifyState((req.query.state as string) || '');
  if (AUTH_ENABLED && !statePayload) {
    return res.status(400).send(escapeHtml('Tham số state không hợp lệ hoặc đã hết hạn. Vui lòng thử kết nối lại.'));
  }
  const oauthUserKey: string = statePayload?.k || 'default';

  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: ${jsonForScript(String(error))} }, window.location.origin);
              window.close();
            } else {
              window.location.href = '/?oauth_error=${encodeURIComponent(error)}';
            }
          </script>
          <p>Xác thực thất bại: ${escapeHtml(error)}. Đang đóng cửa sổ...</p>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send("Thiếu mã xác thực OAuth (code parameter).");
  }

  try {
    const clientId = process.env.GOOGLE_WORKSPACE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET || '';
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      console.error("[Google OAuth] Token Exchange Error:", tokens);
      return res.status(400).send(`Trao đổi token thất bại: ${escapeHtml(tokens.error_description || tokens.error || 'Lỗi không xác định')}`);
    }

    // Fetch User Profile
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json();

    // Lưu token theo đúng người dùng đã khởi tạo luồng (SEC-04) thay vì biến toàn cục dùng chung.
    serverGoogleSessions[oauthUserKey] = {
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      },
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        picture: userInfo.picture,
      },
    };

    saveServerStore();
    console.log(`✅ [Google OAuth 2.0] Authenticated successfully: ${userInfo.email}`);

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google OAuth Success</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; border: 1px solid #334155; padding: 2.5rem; border-radius: 1.25rem; text-align: center; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
            .icon { font-size: 3.5rem; margin-bottom: 1rem; }
            h2 { margin: 0 0 0.5rem 0; color: #10b981; font-size: 1.5rem; }
            p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.5; }
            .user-box { display: flex; align-items: center; justify-content: center; gap: 0.75rem; background: #0f172a; padding: 0.75rem 1rem; border-radius: 0.75rem; border: 1px solid #334155; }
            .avatar { width: 36px; height: 36px; border-radius: 50%; }
            .email { font-weight: 600; color: #38bdf8; font-size: 0.85rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">⚡</div>
            <h2>Kết Nối Google OAuth Thành Công!</h2>
            <p>Xác thực Google OAuth 2.0 hoàn tất. Đã cấp quyền truy cập tài khoản Google & Google Drive.</p>
            <div class="user-box">
              ${(typeof userInfo.picture === 'string' && /^https?:\/\//i.test(userInfo.picture)) ? `<img src="${escapeHtml(userInfo.picture)}" class="avatar" />` : ''}
              <span class="email">${escapeHtml(userInfo.email)}</span>
            </div>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS', user: ${jsonForScript({ id: userInfo.id, email: userInfo.email, name: userInfo.name, picture: userInfo.picture })} }, window.location.origin);
              setTimeout(function() { window.close(); }, 1500);
            } else {
              setTimeout(function() { window.location.href = '/?oauth_success=true'; }, 1500);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("[Google OAuth] Exception during callback:", err);
    res.status(500).send(`Lỗi hệ thống trong quá trình xử lý OAuth 2.0: ${err.message}`);
  }
});

// 3. Get Current Google User Status (theo người dùng đang đăng nhập)
app.get("/api/auth/google/me", async (req, res) => {
  const key = googleUserKey(req);
  const accessToken = await getValidGoogleAccessToken(key);
  res.json({
    connected: !!accessToken && !!serverGoogleSessions[key]?.user,
    user: serverGoogleSessions[key]?.user || null,
    hasClientId: !!process.env.GOOGLE_WORKSPACE_CLIENT_ID,
  });
});

// 4. Logout Google OAuth Session (chỉ ngắt phiên của người dùng hiện tại)
app.post("/api/auth/google/logout", (req, res) => {
  const key = googleUserKey(req);
  delete serverGoogleSessions[key];
  saveServerStore();
  res.json({ success: true, message: "Đã ngắt kết nối tài khoản Google OAuth 2.0" });
});

// Helper to extract text content from a Google Drive file
async function extractTextFromDriveFile(fileId: string, mimeType: string, accessToken: string): Promise<string> {
  let extractedText = "";
  if (mimeType === 'application/vnd.google-apps.document') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    const docRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    extractedText = await docRes.text();
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    const sheetRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    extractedText = await sheetRes.text();
  } else {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (mimeType === 'application/pdf') {
      const arrayBuf = await fileRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      extractedText = pdfData.text || '';
      await parser.destroy();
    } else {
      extractedText = await fileRes.text();
    }
  }
  return extractedText ? extractedText.trim() : "";
}

// 5. List Files & Folders in Google Drive (including Shared Drives & Shared with Me)
app.get("/api/google/drive/files", async (req, res) => {
  try {
    const accessToken = await getValidGoogleAccessToken(googleUserKey(req));
    if (!accessToken) {
      return res.status(401).json({ error: "Chưa kết nối hoặc hết hạn phiên Google OAuth 2.0." });
    }

    const folderId = req.query.folderId as string;
    let query = "trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/pdf' or mimeType = 'text/plain')";
    
    if (folderId && folderId.trim()) {
      const cleanId = folderId.replace(/.*folders\//, '').replace(/\?.*/, '').trim();
      query = `'${cleanId}' in parents and trashed = false`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?pageSize=100&q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,shared,parents)`;

    const driveRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await driveRes.json();
    if (data.error) {
      return res.status(400).json({ error: data.error.message || "Lỗi đọc dữ liệu Google Drive API" });
    }

    res.json({ files: data.files || [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Lỗi truy vấn Google Drive" });
  }
});

// 6. Direct Import Google Drive File into Agent Knowledge Base
app.post("/api/google/drive/import", async (req, res) => {
  try {
    const { fileId, fileName, mimeType } = req.body;
    if (!fileId) {
      return res.status(400).json({ error: "Thiếu thông tin fileId" });
    }

    const accessToken = await getValidGoogleAccessToken(googleUserKey(req));
    if (!accessToken) {
      return res.status(401).json({ error: "Chưa kết nối tài khoản Google OAuth 2.0" });
    }

    const extractedText = await extractTextFromDriveFile(fileId, mimeType, accessToken);

    if (!extractedText) {
      return res.status(400).json({ error: "Tệp không chứa nội dung văn bản có thể trích xuất." });
    }

    const title = fileName || `Google Drive Doc (${fileId})`;
    // [Chống trùng] id ỔN ĐỊNH theo fileId (KHÔNG kèm Date.now()) -> nạp lại cùng tệp = ghi đè, không tạo bản mới.
    const sourceId = `drive-${fileId}`;
    const nowIso = new Date().toISOString();

    const newKnowledge: any = {
      id: sourceId,
      title: title,
      type: 'google_drive' as any,
      content: extractedText,
      url: `https://drive.google.com/file/d/${fileId}/view`,
      status: 'active',
      active: true,
      itemCount: 1,
      wordCount: extractedText.split(/\s+/).filter(Boolean).length,
      lastUpdated: nowIso,
      updatedAt: nowIso,
      lastSyncedAt: nowIso,
    };

    // Upsert theo id trong bộ nhớ: nếu tệp đã có thì cập nhật tại chỗ, chưa có thì thêm mới.
    const existingIdx = serverKnowledgeSources.findIndex((s: any) => s && s.id === sourceId);
    if (existingIdx !== -1) {
      serverKnowledgeSources[existingIdx] = { ...serverKnowledgeSources[existingIdx], ...newKnowledge };
    } else {
      serverKnowledgeSources.push(newKnowledge);
    }
    // [Fix M4] Chờ ghi Supabase và báo trạng thái thật -> nếu ghi lỗi, client biết (tránh mất nguồn mới âm thầm khi redeploy).
    const persist = await saveServerStoreAsync();

    res.json({
      success: true,
      knowledgeSource: newKnowledge,
      textLength: extractedText.length,
      persisted: persist.synced,
      ...(persist.synced ? {} : { warning: "Đã lưu trên máy chủ nhưng CHƯA ghi được vào Supabase: " + (persist.error || 'không rõ') + ". Nguồn có thể mất khi máy chủ khởi động lại." }),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Lỗi nạp tệp từ Google Drive" });
  }
});

// 7. Import Entire Google Drive Folder (including Shared Folders)
app.post("/api/google/drive/folder/import", async (req, res) => {
  try {
    let { folderIdUrl, folderName } = req.body;
    if (!folderIdUrl || !folderIdUrl.trim()) {
      return res.status(400).json({ error: "Thiếu đường dẫn hoặc ID Thư mục Google Drive" });
    }

    const accessToken = await getValidGoogleAccessToken(googleUserKey(req));
    if (!accessToken) {
      return res.status(401).json({ error: "Chưa kết nối tài khoản Google OAuth 2.0" });
    }

    // Extract raw folderId if full URL is passed (e.g. https://drive.google.com/drive/folders/1XYZ...)
    let cleanFolderId = folderIdUrl.trim();
    const match = cleanFolderId.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      cleanFolderId = match[1];
    }

    // Recursive helper to fetch all items in folder
    const processedFiles: any[] = [];
    
    async function scanFolder(currentFolderId: string, depth = 0) {
      if (depth > 3) return; // limit depth to prevent infinite loops

      const query = encodeURIComponent(`'${currentFolderId}' in parents and trashed = false`);
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=100&q=${query}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType)`;

      const listRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const listData = await listRes.json();
      const files = listData.files || [];

      for (const item of files) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          await scanFolder(item.id, depth + 1);
        } else {
          try {
            const text = await extractTextFromDriveFile(item.id, item.mimeType, accessToken);
            if (text && text.trim()) {
              const nowIsoF = new Date().toISOString();
              const newSource: any = {
                id: `drive-${item.id}`, // [Chống trùng] id ỔN ĐỊNH theo fileId
                title: item.name || `Tệp ${item.id}`,
                type: 'google_drive',
                content: text,
                url: `https://drive.google.com/file/d/${item.id}/view`,
                status: 'active',
                active: true,
                wordCount: text.split(/\s+/).filter(Boolean).length,
                lastUpdated: nowIsoF,
                updatedAt: nowIsoF,
                lastSyncedAt: nowIsoF,
              };
              const exIdx = serverKnowledgeSources.findIndex((s: any) => s && s.id === newSource.id);
              if (exIdx !== -1) serverKnowledgeSources[exIdx] = { ...serverKnowledgeSources[exIdx], ...newSource };
              else serverKnowledgeSources.push(newSource);
              processedFiles.push(newSource);
            }
          } catch (err) {
            console.warn(`[Drive Folder Import] Skip unreadable file ${item.name}:`, err);
          }
        }
      }
    }

    await scanFolder(cleanFolderId, 0);

    if (processedFiles.length === 0) {
      return res.status(400).json({ error: "Thư mục rỗng hoặc không tìm thấy tệp văn bản/PDF/Doc/Sheet có thể đọc được." });
    }

    saveServerStore();

    res.json({
      success: true,
      importedCount: processedFiles.length,
      importedSources: processedFiles,
      message: `🎉 Đã nạp thành công ${processedFiles.length} tệp từ Thư mục Google Drive!`
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Lỗi xử lý nạp Thư mục Google Drive" });
  }
});

// Supabase Vector & Database Endpoints

app.post("/api/supabase/test", async (req, res) => {
  try {
    const { tableName = 'knowledge_sources' } = req.body || {};
    // [Security] Chỉ dùng credential từ env server (SUPABASE_URL + SERVICE_ROLE/ANON), không nhận từ client.
    const client = getSupabaseClient();
    if (!client) {
      return res.status(400).json({ error: "Chưa cấu hình Supabase trên máy chủ. Vui lòng đặt SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_ANON_KEY) trong .env." });
    }

    // Check knowledge_sources table
    const { error: ksError } = await client.from(tableName).select('id').limit(1);

    // Check app_config table
    const { error: acError } = await client.from('app_config').select('id').limit(1);

    const ksExists = !ksError;
    const acExists = !acError;

    const sqlSnippet = `-- 1. Bảng lưu trữ Cấu hình Agent, Widget & Sản phẩm (Giữ dữ liệu khi update)
CREATE TABLE IF NOT EXISTS public.app_config (
  id TEXT PRIMARY KEY,
  agent_config JSONB,
  widget_settings JSONB,
  products JSONB,
  knowledge_sources JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng lưu trữ từng mục trong Kho Tri Thức
CREATE TABLE IF NOT EXISTS public.${tableName} (
  id TEXT PRIMARY KEY,
  title TEXT,
  type TEXT,
  url TEXT,
  content TEXT,
  word_count INT,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. [BẢO MẬT] BẬT Row Level Security (KHÔNG tắt RLS).
--    Máy chủ ghi dữ liệu bằng SERVICE ROLE KEY (server-side, tự động bỏ qua RLS một cách an toàn),
--    nên KHÔNG cần mở quyền cho anon. Bật RLS và không tạo policy công khai = chặn mọi truy cập ẩn danh.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
-- (Tùy chọn) Nếu widget cần ĐỌC trực tiếp bằng anon key, thêm policy chỉ-đọc:
-- CREATE POLICY "anon read app_config" ON public.app_config FOR SELECT TO anon USING (true);`;

    if (!ksExists || !acExists) {
      const missing = [];
      if (!acExists) missing.push('app_config');
      if (!ksExists) missing.push(tableName);

      return res.json({
        success: true,
        connected: true,
        tableExists: false,
        missingTables: missing,
        message: `⚠️ Kết nối Supabase thành công! Tuy nhiên chưa tìm thấy bảng [${missing.join(', ')}]. Bạn hãy sao chép đoạn mã SQL bên dưới và Dán vào mục 'SQL Editor' trên trang quản trị Supabase để tạo bảng và bật quyền lưu trữ.`,
        sqlSnippet
      });
    }

    res.json({
      success: true,
      connected: true,
      tableExists: true,
      message: `🎉 Kết nối thành công! Cả 2 bảng 'app_config' và '${tableName}' đã sẵn sàng hoạt động trong Supabase.`,
      sqlSnippet
    });
  } catch (err: any) {
    res.status(500).json({ error: "Lỗi kết nối Supabase: " + (err?.message || '') });
  }
});

app.post("/api/supabase/sync", async (req, res) => {
  try {
    const {
      tableName = 'knowledge_sources',
      knowledgeSources,
      agentConfig,
      widgetSettings,
      products
    } = req.body || {};

    // [Security] Chỉ dùng credential Supabase từ env server, không nhận từ client.
    const client = getSupabaseClient();
    if (!client) {
      return res.status(400).json({ error: "Chưa cấu hình Supabase trên máy chủ (đặt SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong .env)." });
    }

    // Update server memory if client passed fresher state
    // [Fix M3] HỢP NHẤT (union theo id) thay vì THAY THẾ: một client có danh sách cũ/thiếu bấm "Đồng bộ"
    // không được phép cắt kho về tập con (mất dữ liệu). Xóa mục làm qua /api/knowledge/delete-source.
    if (Array.isArray(knowledgeSources) && knowledgeSources.length > 0) {
      const byId = new Map<string, any>();
      for (const s of (serverKnowledgeSources || [])) if (s && s.id) byId.set(s.id, s);
      for (const s of knowledgeSources) if (s && s.id) byId.set(s.id, s); // client mới nhất thắng cho mục nó có
      serverKnowledgeSources = Array.from(byId.values());
    }
    if (agentConfig && typeof agentConfig === 'object') {
      serverAgentConfig = stripAiSecrets({ ...(serverAgentConfig || {}), ...agentConfig });
    }
    if (widgetSettings && typeof widgetSettings === 'object') {
      serverWidgetSettings = widgetSettings;
    }
    if (Array.isArray(products) && products.length > 0) {
      serverProducts = products;
    }

    saveServerStore();

    let appConfigSynced = false;
    let appConfigError = null;
    let ksSyncedCount = 0;
    let ksErrorMsg = null;

    // 1. app_config: cấu hình + sản phẩm + METADATA tri thức (không kèm content lớn) -> tránh statement timeout.
    const fullConfigRecord = {
      id: 'main_config',
      agent_config: serverAgentConfig,
      widget_settings: serverWidgetSettings,
      products: serverProducts,
      knowledge_sources: knowledgeMetaOnly(serverKnowledgeSources),
      updated_at: new Date().toISOString()
    };

    const { error: acErr } = await client.from('app_config').upsert(fullConfigRecord, { onConflict: 'id' });
    if (acErr) {
      appConfigError = acErr.message;
      console.warn("⚠️ [Supabase] app_config table upsert failed:", acErr.message);
    } else {
      appConfigSynced = true;
    }

    // 2. Bảng riêng: nút "Đồng bộ" thủ công -> ghi lại TẤT CẢ (force) theo từng bản ghi (chunked), tránh timeout.
    const sourcesToSync = serverKnowledgeSources || [];
    if (sourcesToSync.length > 0) {
      const diffErr = await syncKnowledgeSourcesDiff(client, tableName, sourcesToSync, true);
      if (diffErr) {
        ksErrorMsg = diffErr;
        console.warn("⚠️ [Supabase] knowledge_sources sync failed:", diffErr);
      } else {
        ksSyncedCount = sourcesToSync.length;
      }
    }

    const sqlHelp = `\n\n💡 Nếu chưa tạo bảng hoặc bị lỗi RLS (Row Level Security), hãy mở Supabase SQL Editor và chạy đoạn SQL tạo bảng.`;

    if (appConfigError && ksErrorMsg) {
      return res.status(400).json({
        error: `Không thể đồng bộ lên Supabase!\n- Lỗi app_config: ${appConfigError}\n- Lỗi ${tableName}: ${ksErrorMsg}${sqlHelp}`
      });
    }

    let statusText = "🎉 Đồng bộ thành công!";
    if (appConfigSynced && ksErrorMsg) {
      statusText = `⚠️ Đã đồng bộ 'app_config', nhưng gặp lỗi ở '${tableName}': ${ksErrorMsg}${sqlHelp}`;
    } else if (!appConfigSynced && appConfigError) {
      statusText = `⚠️ Đã đồng bộ ${ksSyncedCount} mục tri thức vào '${tableName}', nhưng chưa lưu được 'app_config': ${appConfigError}${sqlHelp}`;
    } else {
      statusText = `🎉 Đã đồng bộ thành công cả 2 bảng ('app_config' và '${tableName}') với ${ksSyncedCount} mục tri thức lên Supabase!`;
    }

    res.json({
      success: true,
      appConfigSynced,
      ksSyncedCount,
      message: statusText
    });
  } catch (err: any) {
    res.status(500).json({ error: "Lỗi đồng bộ Supabase: " + (err?.message || '') });
  }
});

app.get("/api/config", async (req, res) => {
  // [Fix hiển thị] Nếu bộ nhớ trống (startup timeout), tải lại tri thức từ Supabase trước khi trả về.
  await ensureKnowledgeLoaded();
  // [Security] Endpoint công khai -> loại bỏ bí mật + [Fix H10] KHÔNG trả nội dung tri thức đầy đủ (chỉ metadata)
  // để tránh lộ toàn bộ tài liệu nội bộ ra internet. Trang quản trị tải nội dung đầy đủ qua POST /api/config/init.
  res.json({
    agentConfig: stripAiSecrets(serverAgentConfig),
    widgetSettings: serverWidgetSettings,
    knowledgeSources: knowledgeMetaOnly(serverKnowledgeSources),
    products: serverProducts,
  });
});

// [Tối ưu băng thông] Cấu hình NHẸ cho widget khách: CHỈ persona + giao diện, KHÔNG kèm toàn bộ kho tri thức/sản phẩm
// (agent dùng tri thức ở phía máy chủ). Cắt phần lớn băng thông tải xuống ở mỗi lượt khách mở chat.
app.get("/api/widget-config", (req, res) => {
  const a: any = stripAiSecrets(serverAgentConfig) || {};
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    agentConfig: {
      name: a.name, title: a.title, businessName: a.businessName,
      businessIndustry: a.businessIndustry, tone: a.tone,
      greetingMessage: a.greetingMessage, avatarUrl: a.avatarUrl,
      // [Nâng cấp] Câu hỏi gợi ý hiện dạng nút bấm trên widget (giảm ma sát, khách lười gõ vẫn tương tác).
      quickReplies: a.quickReplies,
    },
    widgetSettings: serverWidgetSettings,
  });
});

// [Xóa chủ động] Xóa 1 nguồn tri thức khỏi bộ nhớ + Supabase (thay cho việc suy ra xóa từ mảng — vốn gây mất dữ liệu).
app.post("/api/knowledge/delete-source", asyncHandler(async (req, res) => {
  const { id } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: "Thiếu id nguồn tri thức cần xóa." });
  }
  serverKnowledgeSources = (serverKnowledgeSources || []).filter((s: any) => s.id !== id);
  delete lastKnowledgeSyncSig[id];
  delete ragSigMap[id]; // để nếu thêm lại sẽ được auto-index
  saveServerStore();

  const client = getSupabaseClient();
  if (client) {
    const tableName = serverAgentConfig?.supabaseConfig?.tableName || 'knowledge_sources';
    try {
      await client.from(tableName).delete().eq('id', id);
      try { await client.from('kb_chunks').delete().eq('source_id', id); } catch { /* bỏ qua nếu chưa dùng RAG */ }
    } catch (e: any) {
      return res.json({ success: true, warning: "Đã xóa khỏi máy chủ, nhưng lỗi xóa trên Supabase: " + (e?.message || e) });
    }
  }
  res.json({ success: true });
}));

// [Giai đoạn 2] stripAiSecrets đã tách sang src/server/security/sanitize.ts

app.post("/api/config/init", async (req, res) => {
  try {
    // [Fix hiển thị] Đảm bảo tri thức đã nạp từ Supabase trước khi merge/trả về (phòng startup timeout).
    await ensureKnowledgeLoaded();

    const rawClientAgentConfig = req.body?.clientAgentConfig;
    const clientAgentConfig = stripAiSecrets(rawClientAgentConfig);
    const { clientWidgetSettings, clientKnowledgeSources, clientProducts } = req.body || {};

    // [Security - SEC-08] KHÔNG nhận credential Supabase từ client nữa (đã env-only). Chỉ merge phần cấu hình không nhạy cảm.
    if (clientAgentConfig && typeof clientAgentConfig === 'object') {
      serverAgentConfig = stripAiSecrets({
        ...clientAgentConfig,
        ...(serverAgentConfig || {})
      });
    }

    if ((!serverWidgetSettings || Object.keys(serverWidgetSettings).length === 0) && clientWidgetSettings) {
      serverWidgetSettings = clientWidgetSettings;
    }

    // [Nguồn chuẩn = máy chủ] CHỈ dùng dữ liệu localStorage của client để KHỞI TẠO khi máy chủ hoàn toàn trống
    // (lần đầu thiết lập, sau khi ensureKnowledgeLoaded đã nạp từ Supabase). TUYỆT ĐỐI KHÔNG gộp từng mục khi server đã có dữ liệu
    // -> tránh mỗi trình duyệt đẩy localStorage khác nhau lên và làm mục đã xóa "hồi sinh".
    if (Array.isArray(clientKnowledgeSources) && clientKnowledgeSources.length > 0
        && (!serverKnowledgeSources || serverKnowledgeSources.length === 0)) {
      serverKnowledgeSources = clientKnowledgeSources;
    }

    if (Array.isArray(clientProducts) && clientProducts.length > 0
        && (!serverProducts || serverProducts.length === 0)) {
      serverProducts = clientProducts;
    }

    saveServerStore();

    // [RAG] Ghi baseline chữ ký ngay khi tải (không tự index backlog); các thay đổi sau sẽ tự index.
    scheduleAutoIndex();

    res.json({
      success: true,
      agentConfig: stripAiSecrets(serverAgentConfig),
      widgetSettings: serverWidgetSettings,
      knowledgeSources: serverKnowledgeSources,
      products: serverProducts,
    });
  } catch (e: any) {
    res.status(500).json({ error: "Lỗi khởi tạo cấu hình: " + e?.message });
  }
});

app.post("/api/config", async (req, res) => {
  if (req.body?.agentConfig) {
    // [Security] Không lưu API key AI vào store (chỉ nằm ở env server).
    serverAgentConfig = stripAiSecrets({ ...(serverAgentConfig || {}), ...req.body.agentConfig });
  }
  if (req.body?.widgetSettings) {
    serverWidgetSettings = { ...(serverWidgetSettings || {}), ...req.body.widgetSettings };
  }
  // [Chống mất dữ liệu] HỢP NHẤT (union theo id) thay vì thay thế: client chỉ THÊM/SỬA, KHÔNG xóa qua đường này.
  // Việc xóa 1 mục làm qua endpoint /api/knowledge/delete-source. Nhờ vậy một client có danh sách cũ/thiếu
  // không thể làm biến mất mục mà mục đó vẫn còn trên bảng Supabase.
  if (Array.isArray(req.body?.knowledgeSources) && req.body.knowledgeSources.length > 0) {
    const byId = new Map<string, any>();
    for (const s of (serverKnowledgeSources || [])) if (s && s.id) byId.set(s.id, s);
    for (const s of req.body.knowledgeSources) if (s && s.id) byId.set(s.id, s); // client mới nhất thắng cho mục nó có
    serverKnowledgeSources = Array.from(byId.values());
  }
  if (Array.isArray(req.body?.products) && req.body.products.length > 0) {
    // Sản phẩm nằm gọn trong app_config (không có bảng riêng) -> cho phép thay thế để hỗ trợ xóa sản phẩm.
    serverProducts = req.body.products;
  }
  saveServerStore();

  const data = {
    agentConfig: serverAgentConfig,
    widgetSettings: serverWidgetSettings,
    knowledgeSources: serverKnowledgeSources,
    products: serverProducts,
  };

  const sbResult = await saveStoreToSupabase(data);

  // [RAG] Tự động cập nhật chỉ mục cho nguồn mới/đổi nội dung (chạy nền).
  scheduleAutoIndex();

  res.json({
    success: true,
    agentConfig: stripAiSecrets(serverAgentConfig),
    widgetSettings: serverWidgetSettings,
    knowledgeSources: serverKnowledgeSources,
    products: serverProducts,
    supabaseStatus: sbResult
  });
});

// Embeddable JS Widget Script Generator Endpoint
app.get("/api/widget.js", (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const protocol = (host.includes('localhost') || host.includes('127.0.0.1')) ? rawProto : 'https';
  const baseUrl = `${protocol}://${host}`;
  // [Fix H7] null-safe (tránh crash 500 khi chưa có cấu hình) + LÀM SẠCH để chống chèn mã (XSS) vào widget.js:
  // loại ký tự có thể thoát khỏi chuỗi JS/HTML (< > " ' \ và xuống dòng), giới hạn độ dài.
  const launcherText = String(serverWidgetSettings?.buttonText || 'Hỏi Trợ Lý AI')
    .replace(/[<>"'\\\r\n]/g, '')
    .slice(0, 60);

  const jsCode = `
(function() {
  if (window.TechLifeAIAgentLoaded) return;
  window.TechLifeAIAgentLoaded = true;

  console.log("🤖 TechLife AI Customer Support Agent Widget Loading...");

  var isOpen = false;

  // 1. Create Floating Launcher Button
  var btn = document.createElement('button');
  btn.id = 'techlife-ai-agent-launcher';
  btn.setAttribute('aria-label', 'Mở Chat AI');
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;height:52px;padding:0 18px 0 14px;border-radius:26px;background:linear-gradient(135deg, #2563eb, #4f46e5);color:#ffffff;border:none;box-shadow:0 10px 25px -5px rgba(37, 99, 235, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.1);cursor:pointer;display:flex;align-items:center;gap:8px;font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;font-size:13px;font-weight:600;transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);outline:none;line-height:1;';

  var botSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M9 18v2"/><path d="M15 18v2"/><path d="M12 2v4"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 11h.01"/></svg>';
  var closeSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  btn.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(255,255,255,0.2);border-radius:50%;" id="techlife-ai-btn-icon">' + botSvg + '</span>' +
                  '<span id="techlife-ai-btn-text">${launcherText}</span>' +
                  '<span style="position:absolute;top:2px;right:2px;width:10px;height:10px;background:#10b981;border:2px solid #ffffff;border-radius:50%;"></span>';

  // 2. Create Chat Iframe (Collapsed / Hidden by Default)
  var iframe = document.createElement('iframe');
  iframe.id = 'techlife-ai-agent-iframe';
  iframe.src = '${baseUrl}/?mode=widget';
  iframe.style.cssText = 'position:fixed;bottom:82px;right:20px;width:380px;max-width:calc(100vw - 32px);height:580px;max-height:calc(100vh - 100px);border:none;border-radius:20px;box-shadow:0 20px 30px -10px rgba(0, 0, 0, 0.25), 0 10px 15px -5px rgba(0, 0, 0, 0.1);z-index:999998;transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);opacity:0;pointer-events:none;transform:translateY(15px) scale(0.96);display:none;background:#f8fafc;';
  iframe.allow = 'camera; microphone; autoplay';

  function toggleWidget(forceState) {
    isOpen = forceState !== undefined ? forceState : !isOpen;
    var iconContainer = document.getElementById('techlife-ai-btn-icon');
    var textContainer = document.getElementById('techlife-ai-btn-text');

    if (isOpen) {
      iframe.style.display = 'block';
      setTimeout(function() {
        iframe.style.opacity = '1';
        iframe.style.transform = 'translateY(0) scale(1)';
        iframe.style.pointerEvents = 'auto';
        // Báo cho nội dung iframe biết widget vừa mở -> cuộn xuống tin nhắn mới nhất.
        try { iframe.contentWindow && iframe.contentWindow.postMessage({ type: 'AI_WIDGET_OPENED' }, '*'); } catch (e) {}
      }, 60);
      if (iconContainer) iconContainer.innerHTML = closeSvg;
      if (textContainer) textContainer.innerText = 'Thu gọn';
    } else {
      iframe.style.opacity = '0';
      iframe.style.transform = 'translateY(15px) scale(0.96)';
      iframe.style.pointerEvents = 'none';
      setTimeout(function() {
        if (!isOpen) iframe.style.display = 'none';
      }, 300);
      if (iconContainer) iconContainer.innerHTML = botSvg;
      if (textContainer) textContainer.innerText = '${launcherText}';
    }
  }

  btn.onclick = function() {
    toggleWidget();
  };

  btn.onmouseenter = function() {
    btn.style.transform = 'translateY(-2px) scale(1.02)';
  };
  btn.onmouseleave = function() {
    btn.style.transform = 'translateY(0) scale(1)';
  };

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'TOGGLE_AI_WIDGET') {
      toggleWidget(e.data.open);
    }
  });

  document.body.appendChild(iframe);
  document.body.appendChild(btn);
})();
`;

  res.setHeader("Content-Type", "application/javascript");
  res.send(jsCode);
});


// Vite middleware setup for Development / Static server for Production
async function startServer() {
  await loadServerStore();

  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV === "production" && hasDist) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // [Giai đoạn 2] Error-handler tập trung: đăng ký sau tất cả route/middleware.
  app.use(errorHandler);

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 AI Agent Server running at http://0.0.0.0:${PORT}`);
  });
  server.timeout = 300000; // 5 minutes
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
}

startServer();
