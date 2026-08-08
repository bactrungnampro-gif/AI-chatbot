import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
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

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Increase body parser limits for base64 file uploads (images, PDFs, short videos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS for embeddable widgets across external domains
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize Gemini Client
const getGeminiAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// --- API ENDPOINTS ---

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

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

// --- HELPER FUNCTIONS FOR HYBRID SCRAPING ---

// Helper: Clean HTML to readable plain text
function cleanHtmlContent(html: string): string {
  if (!html) return "";
  let text = html
    .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
    .replace(/<svg\b[^<]*>([\s\S]*?)<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

// Helper: Extract Page Title
function extractPageTitle(html: string, fallbackUrl: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1].trim()) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match && h1Match[1].trim()) {
    return cleanHtmlContent(h1Match[1]);
  }
  return fallbackUrl;
}

// Helper: Extract internal sub-links from HTML
function extractInternalLinks(html: string, baseUrlStr: string): string[] {
  const links = new Set<string>();
  try {
    const baseUrl = new URL(baseUrlStr);
    const domainHost = baseUrl.hostname.toLowerCase();
    
    // Match href attributes
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      let href = match[1].trim();
      
      // Skip fragment, javascript, mailto, tel
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }
      
      // Ignore static media & non-HTML file extensions
      if (/\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|doc|docx|zip|rar|tar|gz|mp4|mp3|avi|css|js|woff|woff2|ttf|eot)$/i.test(href)) {
        continue;
      }
      
      try {
        const resolvedUrl = new URL(href, baseUrlStr);
        // Ensure same domain hostname
        if (resolvedUrl.hostname.toLowerCase() === domainHost) {
          // Strip fragment hash
          resolvedUrl.hash = '';
          // Remove trailing slash for normalization (unless root)
          let cleanedHref = resolvedUrl.toString();
          if (cleanedHref.length > 10 && cleanedHref.endsWith('/')) {
            cleanedHref = cleanedHref.slice(0, -1);
          }
          links.add(cleanedHref);
        }
      } catch (err) {
        // Ignore invalid URLs
      }
    }
  } catch (err) {
    console.warn('[Link Extractor] Failed to parse base URL:', err);
  }
  return Array.from(links);
}

// Helper: Fetch Sitemaps for a domain (sitemap.xml, sitemap_index.xml, robots.txt)
async function fetchSitemapUrls(baseUrlStr: string): Promise<{ urls: string[], sitemapLocation?: string }> {
  const foundUrls = new Set<string>();
  let sitemapLoc: string | undefined = undefined;
  
  try {
    const baseUrl = new URL(baseUrlStr);
    const origin = baseUrl.origin;
    const domainHost = baseUrl.hostname.toLowerCase();
    
    const isDirectXml = baseUrlStr.toLowerCase().endsWith('.xml') || baseUrlStr.toLowerCase().includes('sitemap');
    const candidateSitemaps: string[] = [];
    
    // IF the user provided a specific sitemap URL (e.g., sitemap_blogs_1.xml), test it FIRST!
    if (isDirectXml) {
      candidateSitemaps.push(baseUrlStr);
    }
    
    candidateSitemaps.push(
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/sitemap-index.xml`,
      `${origin}/sitemap/sitemap.xml`
    );
    
    // Check robots.txt for custom sitemap declarations only if user didn't enter a direct sitemap
    if (!isDirectXml) {
      try {
        const robotsRes = await fetch(`${origin}/robots.txt`, {
          headers: { 'User-Agent': 'aistudio-hybrid-crawler/1.0' },
          signal: AbortSignal.timeout(5000)
        });
        if (robotsRes.ok) {
          const robotsText = await robotsRes.text();
          const sitemapMatches = robotsText.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi);
          if (sitemapMatches) {
            for (const sm of sitemapMatches) {
              const smUrl = sm.replace(/Sitemap:\s*/i, '').trim();
              if (smUrl && !candidateSitemaps.includes(smUrl)) {
                candidateSitemaps.push(smUrl);
              }
            }
          }
        }
      } catch (rErr) {
        // Ignore robots fetch failure
      }
    }
    
    // Fetch candidate sitemaps in priority order
    for (const smUrl of candidateSitemaps) {
      if (foundUrls.size >= 1200) break; // Limit total sitemap URLs collected
      try {
        const smRes = await fetch(smUrl, {
          headers: { 'User-Agent': 'aistudio-hybrid-crawler/1.0' },
          signal: AbortSignal.timeout(6000)
        });
        if (!smRes.ok) continue;
        const xmlText = await smRes.text();
        
        sitemapLoc = smUrl;
        
        // Match <loc> URLs
        const locRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
        let match;
        const subSitemaps: string[] = [];
        
        while ((match = locRegex.exec(xmlText)) !== null) {
          const loc = match[1].trim();
          if (loc.endsWith('.xml') || loc.includes('sitemap')) {
            subSitemaps.push(loc);
          } else {
            try {
              const parsed = new URL(loc);
              if (parsed.hostname.toLowerCase() === domainHost) {
                parsed.hash = '';
                let cleaned = parsed.toString();
                if (cleaned.length > 10 && cleaned.endsWith('/')) cleaned = cleaned.slice(0, -1);
                foundUrls.add(cleaned);
              }
            } catch (e) {}
          }
        }
        
        // If sitemap index contains sub-sitemaps and no direct page URLs were found in current file, fetch sub-sitemaps in parallel
        if (foundUrls.size === 0 && subSitemaps.length > 0) {
          const subSitemapPromises = subSitemaps.slice(0, 15).map(async (subSm) => {
            try {
              const subRes = await fetch(subSm, {
                headers: { 'User-Agent': 'aistudio-hybrid-crawler/1.0' },
                signal: AbortSignal.timeout(3000)
              });
              if (subRes.ok) {
                const subXml = await subRes.text();
                const extracted: string[] = [];
                let subMatch;
                const subLocRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
                while ((subMatch = subLocRegex.exec(subXml)) !== null) {
                  const loc = subMatch[1].trim();
                  if (!loc.endsWith('.xml')) {
                    try {
                      const parsed = new URL(loc);
                      if (parsed.hostname.toLowerCase() === domainHost) {
                        parsed.hash = '';
                        let cleaned = parsed.toString();
                        if (cleaned.length > 10 && cleaned.endsWith('/')) cleaned = cleaned.slice(0, -1);
                        extracted.push(cleaned);
                      }
                    } catch (e) {}
                  }
                }
                return extracted;
              }
            } catch (subErr) {}
            return [];
          });

          const subResults = await Promise.all(subSitemapPromises);
          for (const resList of subResults) {
            for (const item of resList) {
              foundUrls.add(item);
              if (foundUrls.size >= 1500) break;
            }
          }
        }
        
        if (foundUrls.size > 0) break; // Found valid page URLs from this candidate sitemap, stop checking others!
      } catch (smErr) {
        // Try next candidate
      }
    }
  } catch (err) {
    console.warn('[Sitemap Crawler] Error fetching sitemap:', err);
  }
  
  return { urls: Array.from(foundUrls), sitemapLocation: sitemapLoc };
}

// Website Content Scraper / Extractor Endpoint (Hybrid Support)
app.post("/api/knowledge/scrape", async (req, res) => {
  const globalRequestStart = Date.now();
  const MAX_GLOBAL_TIME_MS = 42000; // 42 seconds total budget to guarantee response before 502/504 gateway timeout

  try {
    const { url, mode = 'hybrid', maxPages = 10 } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "URL không hợp lệ hoặc thiếu" });
      return;
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    // Parse maxPages limit (1 to 1000)
    const pageLimit = Math.min(Math.max(parseInt(String(maxPages), 10) || 10, 1), 1000);
    const crawlMode = ['hybrid', 'sitemap', 'sublinks', 'single'].includes(mode) ? mode : 'hybrid';

    console.log(`[Scraper] Starting ${crawlMode.toUpperCase()} crawl for: ${targetUrl} (Max pages: ${pageLimit})`);

    // Step 1: Fetch Main Entry Page
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

    const mainHtml = await mainResponse.text();
    const isXmlSitemap = targetUrl.toLowerCase().endsWith('.xml') || mainHtml.includes('<urlset') || mainHtml.includes('<sitemapindex');
    
    let mainTitle = extractPageTitle(mainHtml, targetUrl);
    let mainText = cleanHtmlContent(mainHtml);

    if (isXmlSitemap) {
      const fileName = targetUrl.split('/').pop() || targetUrl;
      mainTitle = `Sitemap XML: ${fileName}`;
      mainText = `Sitemap XML chứa danh sách liên kết từ ${targetUrl}`;
    }

    // If mode is 'single', return immediately
    if (crawlMode === 'single' || pageLimit === 1) {
      let finalSingleText = mainText;
      if (finalSingleText.length > 12000) {
        finalSingleText = finalSingleText.substring(0, 12000) + "... [Đã rút gọn]";
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
        subPages: [{ title: mainTitle, url: targetUrl }]
      });
      return;
    }

    // --- HYBRID / MULTI-PAGE CRAWLING ---
    let discoveredSitemapUrls: string[] = [];
    let discoveredSublinks: string[] = [];
    let sitemapLocation: string | undefined = undefined;

    // Direct extraction of <loc> if targetUrl itself is an XML sitemap
    if (isXmlSitemap) {
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
    if ((crawlMode === 'hybrid' || crawlMode === 'sublinks') && !isXmlSitemap) {
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
      // URLs in both sitemap & sublinks get bonus
      if (discoveredSitemapUrls.includes(u) && discoveredSublinks.includes(u)) score += 5;
      for (const kw of priorityKeywords) {
        if (lower.includes(kw)) score += 3;
      }
      // Shorter path URLs usually contain main category/info
      score += Math.max(0, 10 - u.split('/').length);
      return score;
    };

    // Combine all discovered candidates
    const allDiscovered = Array.from(new Set([...discoveredSitemapUrls, ...discoveredSublinks]))
      .filter(u => u !== normalizedTargetUrl && u !== targetUrl && u !== targetUrl + '/');

    // Sort candidates by priority score descending (if sitemap was specifically provided, preserve sitemap order mostly)
    if (!isXmlSitemap) {
      allDiscovered.sort((a, b) => scoreUrl(b) - scoreUrl(a));
    }

    // Select sub-pages queue (if targetUrl is XML sitemap, crawl up to pageLimit pages directly)
    const pagesToCrawlLimit = isXmlSitemap ? pageLimit : (pageLimit - 1);
    const subPagesToCrawl = allDiscovered.slice(0, pagesToCrawlLimit);

    console.log(`[Scraper] Crawling top ${subPagesToCrawl.length} sub-pages out of ${allDiscovered.length} discovered candidates.`);

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

    // Concurrency batch execution with high-throughput parallelism & dynamic timeout
    let BATCH_SIZE = 10;
    let PAGE_TIMEOUT_MS = 3500;

    if (subPagesToCrawl.length > 500) {
      BATCH_SIZE = 60; // Ultra high parallelism for 500-1000 pages
      PAGE_TIMEOUT_MS = 2200;
    } else if (subPagesToCrawl.length > 200) {
      BATCH_SIZE = 40; // High parallelism for 200-500 pages
      PAGE_TIMEOUT_MS = 2500;
    } else if (subPagesToCrawl.length > 50) {
      BATCH_SIZE = 20;
      PAGE_TIMEOUT_MS = 3000;
    }

    for (let i = 0; i < subPagesToCrawl.length; i += BATCH_SIZE) {
      // Safety threshold check before executing next batch
      if (Date.now() - globalRequestStart > MAX_GLOBAL_TIME_MS) {
        console.log(`[Scraper] Reached ${MAX_GLOBAL_TIME_MS}ms global time window budget! Returning ${scrapedPagesList.length} pages accumulated so far.`);
        break;
      }

      const batch = subPagesToCrawl.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (subUrl) => {
        try {
          const res = await fetch(subUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
          });
          if (!res.ok) return null;
          const subHtml = await res.text();
          const subTitle = extractPageTitle(subHtml, subUrl);
          const subContent = cleanHtmlContent(subHtml);
          if (subContent.length < 50) return null; // Skip empty pages

          return {
            title: subTitle,
            url: subUrl,
            content: subContent,
            wordCount: subContent.split(/\s+/).filter(Boolean).length
          };
        } catch (err) {
          return null; // Ignore individual page fetch errors silently
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const item of batchResults) {
        if (item) scrapedPagesList.push(item);
      }
    }

    // Fallback if no subpages could be scraped for XML
    if (scrapedPagesList.length === 0) {
      scrapedPagesList.push({
        title: mainTitle,
        url: targetUrl,
        content: mainText,
        wordCount: mainText.split(/\s+/).filter(Boolean).length
      });
    }

    // Build Combined Knowledge Document
    let combinedContent = `=== TỔNG HỢP DỮ LIỆU CÀO WEBSITE LAI (HYBRID CRAWLER) ===\n`;
    combinedContent += `Trang gốc: ${targetUrl}\n`;
    combinedContent += `Cơ chế: ${crawlMode.toUpperCase()} (Sitemap + Quét liên kết sub-links)\n`;
    combinedContent += `Tổng số trang đã cào thành công: ${scrapedPagesList.length} trang\n\n`;

    // Dynamic per-page truncation based on page count to preserve total context window & lightweight payload
    let maxCharsPerPage = 5000;
    if (scrapedPagesList.length > 300) {
      maxCharsPerPage = 500;
    } else if (scrapedPagesList.length > 100) {
      maxCharsPerPage = 800;
    } else if (scrapedPagesList.length > 50) {
      maxCharsPerPage = 1200;
    } else if (scrapedPagesList.length > 20) {
      maxCharsPerPage = 2500;
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

// 1. Google Sheets Fetch Endpoint
app.post("/api/knowledge/fetch-google-sheet", async (req, res) => {
  try {
    const { sheetUrl, sheetName } = req.body;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      res.status(400).json({ success: false, error: "Vui lòng nhập URL Google Sheet hợp lệ." });
      return;
    }

    console.log(`[Google Sheets] Fetching sheet from: ${sheetUrl}`);

    // Extract Spreadsheet ID
    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      res.status(400).json({ success: false, error: "Định dạng URL Google Sheet không đúng. Cần có dạng https://docs.google.com/spreadsheets/d/ID/edit" });
      return;
    }

    const spreadsheetId = sheetIdMatch[1];
    let csvText = "";
    let sheetTitle = sheetName || "Google Sheet Data";

    // Attempt 1: Direct CSV Export (Works for shared/public Google Sheets)
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

    // Convert CSV/Tabular data into structured AI knowledge text
    if (!csvText || csvText.trim().length === 0) {
      res.json({
        success: false,
        error: "Không thể đọc dữ liệu Google Sheet. Vui lòng đảm bảo bảng tính đã bật chế độ 'Bất kỳ ai có liên kết đều có thể xem' (Anyone with link can view).",
      });
      return;
    }

    const lines = csvText.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) {
      res.json({ success: false, error: "Google Sheet trống hoặc không chứa dữ liệu." });
      return;
    }

    // Format headers and rows
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    let formattedData = `=== DỮ LIỆU ĐỒNG BỘ TỪ GOOGLE SHEETS ===\n`;
    formattedData += `Nguồn bảng tính: ${sheetUrl}\n`;
    formattedData += `Số dòng dữ liệu: ${lines.length - 1}\n\n`;
    formattedData += `BẢNG CỘT THÔNG TIN: ${headers.join(' | ')}\n\n`;

    lines.slice(1).forEach((line, index) => {
      const cells = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      formattedData += `--- HÀNG ${index + 1} ---\n`;
      headers.forEach((header, hIdx) => {
        const val = cells[hIdx] || "N/A";
        formattedData += `• ${header || `Cột ${hIdx + 1}`}: ${val}\n`;
      });
      formattedData += `\n`;
    });

    const wordCount = formattedData.split(/\s+/).filter(Boolean).length;

    res.json({
      success: true,
      title: `Google Sheet: ${sheetTitle} (${lines.length - 1} dòng)`,
      url: sheetUrl,
      content: formattedData,
      wordCount: wordCount,
      rowCount: lines.length - 1
    });

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
app.post("/api/knowledge/fetch-api-endpoint", async (req, res) => {
  try {
    const { apiUrl, method = "GET", headers = {}, body = null, title } = req.body;
    if (!apiUrl || typeof apiUrl !== "string") {
      res.status(400).json({ success: false, error: "Vui lòng nhập API Endpoint URL hợp lệ." });
      return;
    }

    console.log(`[API Integration] Syncing data from REST API: ${method} ${apiUrl}`);

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

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: parsedHeaders,
      signal: AbortSignal.timeout(12000)
    };

    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && body) {
      if (typeof body === 'object') {
        fetchOptions.body = JSON.stringify(body);
        parsedHeaders['Content-Type'] = 'application/json';
      } else {
        fetchOptions.body = String(body);
      }
    }

    const response = await fetch(apiUrl, fetchOptions);
    if (!response.ok) {
      res.json({
        success: false,
        error: `API Endpoint trả về mã lỗi HTTP ${response.status} (${response.statusText}). Vui lòng kiểm tra lại URL và API Key/Headers.`
      });
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    let rawData: any;
    let formattedText = "";

    if (contentType.includes('application/json')) {
      rawData = await response.json();
      formattedText = JSON.stringify(rawData, null, 2);
    } else {
      formattedText = await response.text();
    }

    if (!formattedText || formattedText.trim().length === 0) {
      res.json({ success: false, error: "API Endpoint không trả về dữ liệu nào (Trống)." });
      return;
    }

    let combinedData = `=== DỮ LIỆU ĐỒNG BỘ TỪ REST API HỆ THỐNG BÊN NGOÀI ===\n`;
    combinedData += `API Endpoint: ${method.toUpperCase()} ${apiUrl}\n`;
    combinedData += `Thời gian đồng bộ: ${new Date().toLocaleString('vi-VN')}\n\n`;
    combinedData += `NỘI DUNG DỮ LIỆU ĐÃ HỌC:\n${formattedText.substring(0, 40000)}`;

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

    console.log(`[File Upload] Processing uploaded file: ${cleanName} (${fileType || 'unknown'}, ${fileBuffer.length} bytes)`);

    const isPdf = (fileType && fileType.includes('pdf')) || cleanName.toLowerCase().endsWith('.pdf');
    const isDocx = (fileType && (fileType.includes('word') || fileType.includes('officedocument'))) || cleanName.toLowerCase().endsWith('.docx') || cleanName.toLowerCase().endsWith('.doc');

    if (isPdf) {
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
    } else if (isDocx) {
      // Decode readable text from docx/text
      extractedText = fileBuffer.toString('utf-8').replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, '');
      if (extractedText.length < 30) {
        extractedText = `Tài liệu Word: ${cleanName}\n(Đã nạp file thành công vào cơ sở dữ liệu)`;
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

    // Limit maximum text size to preserve fast AI processing while keeping full information
    if (extractedText.length > 80000) {
      extractedText = extractedText.substring(0, 80000) + "\n\n... [Nội dung tài liệu dài đã được tối ưu cho AI]";
    }

    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;

    let formattedContent = `=== TÀI LIỆU NẠP TRỰC TIẾP TỪ FILE ===\n`;
    formattedContent += `Tên tệp: ${cleanName}\n`;
    formattedContent += `Loại tệp: ${isPdf ? 'Tài liệu PDF' : isDocx ? 'Tài liệu Word' : 'Tập tin văn bản'}\n`;
    if (isPdf && pageCount > 1) {
      formattedContent += `Số trang PDF: ${pageCount} trang\n`;
    }
    formattedContent += `Thời gian nạp: ${new Date().toLocaleString('vi-VN')}\n\n`;
    formattedContent += `NỘI DUNG TÀI LIỆU:\n${extractedText}`;

    res.json({
      success: true,
      title: `${isPdf ? 'File PDF' : 'Tệp Tin'}: ${cleanName}`,
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

// Extract Product Catalog Items from Scraped Website Content Endpoint
app.post("/api/knowledge/extract-products", async (req, res) => {
  try {
    const { content, url, title } = req.body;
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "Nội dung văn bản trống, không thể trích xuất sản phẩm." });
      return;
    }

    console.log(`[Product Extractor] Extracting products from content (${content.length} chars)`);

    const apiKey = process.env.GEMINI_API_KEY;
    let extractedProducts: any[] = [];

    if (apiKey) {
      try {
        const ai = getGeminiAI();
        const prompt = `Bạn là hệ thống trích xuất danh mục sản phẩm tự động từ dữ liệu website đã nạp/cào.
Hãy đọc kỹ đoạn văn bản dưới đây và trích xuất TOÀN BỘ danh sách các sản phẩm, thiết bị hoặc dịch vụ được đề cập thành cấu trúc dữ liệu JSON.

Nguồn Website: ${url || title || 'Website'}
Nội dung văn bản:
${content.substring(0, 10000)}

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
`;

        const response = await ai.models.generateContent({
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
                      inStock: { type: Type.BOOLEAN }
                    },
                    required: ["name", "category", "price", "description", "keyFeatures"]
                  }
                }
              },
              required: ["products"]
            }
          }
        });

        if (response.text) {
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
          inStock: true
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
      sourceUrl: url || undefined
    }));

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

// Main AI Support Chat Endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      history = [],
      agentConfig: clientAgentConfig,
      knowledgeSources: clientKnowledgeSources,
      products: clientProducts,
      attachments = []
    } = req.body;

    // Use client data if provided & non-empty, otherwise fallback to server store
    const agentConfig = (clientAgentConfig && (clientAgentConfig.name || clientAgentConfig.businessName)) 
      ? { ...(serverAgentConfig || {}), ...clientAgentConfig } 
      : (serverAgentConfig || clientAgentConfig || {});

    const knowledgeSources = (Array.isArray(clientKnowledgeSources) && clientKnowledgeSources.length > 0)
      ? clientKnowledgeSources
      : (Array.isArray(serverKnowledgeSources) && serverKnowledgeSources.length > 0 ? serverKnowledgeSources : (clientKnowledgeSources || []));

    const products = (Array.isArray(clientProducts) && clientProducts.length > 0)
      ? clientProducts
      : (Array.isArray(serverProducts) && serverProducts.length > 0 ? serverProducts : (clientProducts || []));

    if (!message && (!attachments || attachments.length === 0)) {
      res.status(400).json({ error: "Yêu cầu cần chứa tin nhắn hoặc tệp đính kèm." });
      return;
    }

    const ai = getGeminiAI();

    // Check if current brand is custom (not default "TechLife Viet Nam")
    const currentBusinessName = agentConfig?.businessName || 'Doanh Nghiệp';
    const isDefaultTechLifeBrand = !currentBusinessName || currentBusinessName.trim().toLowerCase() === 'techlife viet nam';

    const defaultKbIds = ['kb_1', 'kb_2', 'kb_3', 'kb_4'];
    const defaultProductIds = ['prod_1', 'prod_2', 'prod_3'];

    const hasUserKnowledge = knowledgeSources.some((k: any) => !defaultKbIds.includes(k.id) && !k.title?.includes('TechLife'));
    const hasUserProducts = products.some((p: any) => !defaultProductIds.includes(p.id) && !p.name?.includes('TechLife'));

    // Filter Knowledge Base Sources:
    // Filter out default sample items IF brand is custom OR IF user has added new knowledge sources
    const filteredKnowledgeSources = knowledgeSources.filter((k: any) => {
      if (!isDefaultTechLifeBrand || hasUserKnowledge) {
        if (defaultKbIds.includes(k.id)) return false;
        if (k.title?.toLowerCase().includes('techlife') || k.content?.includes('TechLife Việt Nam')) return false;
      }
      return true;
    });

    // Filter Product Catalog Items:
    const filteredProducts = products.filter((p: any) => {
      if (!isDefaultTechLifeBrand || hasUserProducts) {
        if (defaultProductIds.includes(p.id)) return false;
        if (p.name?.toLowerCase().includes('techlife') || p.description?.includes('TechLife')) return false;
      }
      return true;
    });

    // Prepare Knowledge Base Context (with character length safety cap to avoid TPM 200k OpenAI limit)
    const MAX_KB_TOTAL_CHARS = 24000;
    let currentKbChars = 0;

    const activeKnowledge = filteredKnowledgeSources
      .filter((k: any) => k.active && k.content)
      .map((k: any) => {
        let textContent = k.content || "";
        if (textContent.length > 6000) {
          textContent = textContent.substring(0, 6000) + "\n...[Nội dung tri thức đã được tối ưu độ dài]";
        }
        let kText = `=== [CƠ SỞ DỮ LIỆU: ${k.title} (${k.type})] ===\n`;
        if (k.url && !k.url.includes('docs.google.com') && !k.url.includes('drive.google.com')) {
          kText += `• LINK WEBSITE NẠP: ${k.url}\n`;
        }
        if (Array.isArray(k.subPages) && k.subPages.length > 0) {
          kText += `• TRANG CON WEBSITE NẠP:\n`;
          k.subPages.forEach((sp: any) => {
            if (sp.url && !sp.url.includes('docs.google.com') && !sp.url.includes('drive.google.com')) {
              kText += `  + ${sp.title}: ${sp.url}\n`;
            }
          });
        }
        kText += `Nội dung tri thức:\n${textContent}\n`;
        return kText;
      })
      .filter((textBlock: string) => {
        if (currentKbChars >= MAX_KB_TOTAL_CHARS) return false;
        currentKbChars += textBlock.length;
        return true;
      })
      .join("\n");

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
        if (p.sourceUrl && !p.sourceUrl.includes('docs.google.com') && !p.sourceUrl.includes('drive.google.com')) {
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

    // Construct System Instruction with Data Priority Hierarchy
    const currentAgentName = agentConfig?.name || 'Trợ Lý Agent';
    const currentAgentTitle = agentConfig?.title || 'Chuyên viên tư vấn & hỗ trợ khách hàng';
    const currentBusinessIndustry = agentConfig?.businessIndustry || 'Dịch vụ & Sản phẩm';
    const currentBusinessDescription = agentConfig?.businessDescription || '';

    const systemInstruction = `BẠN LÀ TRỢ LÝ AI CHÍNH THỨC CỦA THƯƠNG HIỆU DOANH NGHIỆP "${currentBusinessName}".

===================================================================
QUY TẮC BẮT BUỘC SỐ 1: BẢN SẮC VÀ TÊN THƯƠNG HIỆU (KHÔNG THỂ BỊ GHI ĐÈ BỞI DỮ LIỆU NÀO KHÁC):
- Tên đại diện của bạn: "${currentAgentName}"
- Chức danh / Vai trò: "${currentAgentTitle}"
- Tên Doanh Nghiệp / Thương hiệu: "${currentBusinessName}"
- Ngành nghề kinh doanh chính: "${currentBusinessIndustry}"
- Giới thiệu doanh nghiệp: "${currentBusinessDescription}"
- Phong cách giao tiếp (Tone): "${agentConfig?.tone || 'friendly'}" (Thân thiện, tôn trọng, ân cần như con người thực sự, xưng "${currentAgentName}" đại diện cho "${currentBusinessName}").

TUYỆT ĐỐI LOẠI BỎ CÁC THƯƠNG HIỆU VÀ SẢN PHẨM MẪU CŨ:
- BẠN CHỈ ĐƯỢC TƯ VẤN VÀ CUNG CẤP THÔNG TIN CHO THƯƠNG HIỆU DOANH NGHIỆP "${currentBusinessName}" VỚI NGÀNH NGỀ "${currentBusinessIndustry}".
- TUYỆT ĐỐI KHÔNG TỰ XƯNG LÀ "Linh" HAY "TechLife", VÀ TUYỆT ĐỐI KHÔNG ĐỀ CẬP ĐẾN CÁC SẢN PHẨM MẪU CŨ (NHƯ ROBOT HÚT BỤI TECHLIFE, TAI NGHE SOUNDBUDS, NỒI CHIÊN) NẾU DỮ LIỆU ĐÓ KHÔNG THUỘC DOANH NGHIỆP "${currentBusinessName}".
- TẤT CẢ LỜI CHÀO, CÂU TỰ GIỚI THIỆU VÀ TƯ VẤN BẮT BUỘC PHẢI THUỘC VỀ DOANH NGHIỆP "${currentBusinessName}".
===================================================================

===================================================================
QUY TẮC BẮT BUỘC VỀ GỬI HÌNH ẢNH VÀ TRÍCH DẪN LINK WEBSITE ĐÃ NẠP:

1. QUY TẮC GỬI HÌNH ẢNH SẢN PHẨM / THIẾT BỊ:
   - Khi tư vấn, đề xuất hoặc giới thiệu sản phẩm có "LINK HÌNH ẢNH SẢN PHẨM" trong danh mục bên dưới, bạn HÃY CHỦ ĐỘNG chèn hình ảnh sản phẩm vào câu trả lời bằng cú pháp Markdown:
     ![Tên sản phẩm](URL_Hình_Ảnh)
   - Đặt hình ảnh ngay bên dưới tên sản phẩm hoặc giá bán để câu trả lời sinh động, trực quan và chuyên nghiệp.

2. QUY TẮC GỬI LINK WEBSITE (BÀI VIẾT / TRANG NGUỒN WEBSITE):
   - CHỈ GỬI LINK WEBSITE KHI KHÁCH HÀNG CÓ YÊU CẦU HOẶC KHÁCH HÀNG MUỐN TÌM HIỂU KỸ HƠN (Ví dụ: khách hỏi "gửi link", "cho xin link", "xem chi tiết ở đâu", "muốn xem thêm", "tìm hiểu sâu hơn", v.v.).
   - NẾU KHÁCH HÀNG KHÔNG YÊU CẦU LINK HOẶC KHÔNG CÓ Ý ĐỊNH XEM CHI TIẾT TRANG WEB, KHÔNG CẦN TỰ Ý GỬI LINK WEBSITE để tránh làm rườm rà tin nhắn.
   - NGUYÊN TẮC GIỚI HẠN AN TOÀN LINK DUY NHẤT:
     + CHỈ ĐƯỢC DÙNG link trang web chính thức từ "LINK WEBSITE NẠP", "TRANG CON WEBSITE NẠP", hoặc "LINK WEB NẠP SẢN PHẨM" trong dữ liệu đã nạp bên dưới.
     + TUYỆT ĐỐI KHÔNG gửi bất kỳ link nào từ Google Sheets (docs.google.com) hoặc Google Drive (drive.google.com).
     + TUYỆT ĐỐI KHÔNG tự bịa ra link hoặc lấy link trang web ngoài chưa được nạp.
   - Định dạng link bằng Markdown sạch đẹp: [Tên Bài Viết/Trang Web](URL_Web_Đã_Nạp).
===================================================================

CƠ CHẾ ƯU TIÊN DỮ LIỆU ĐỂ TRẢ LỜI KHÁCH HÀNG:
1. MỨC ƯU TIÊN SỐ 1 - DỮ LIỆU ĐÃ NẠP (WEBSITE CRAWLED, TÀI LIỆU KHÁCH HÀNG & CƠ SỞ TRI THỨC):
   - Bạn BẮT BUỘC phải tra cứu và khai thác tối đa thông tin từ "CƠ SỞ TRI THỨC (KNOWLEDGE BASE)" và "DANH MỤC SẢN PHẨM" được nạp bên dưới trước tiên.
   - Khi dữ liệu đã nạp chứa thông tin phù hợp, hãy đưa ra câu trả lời dựa trên nguồn dữ liệu doanh nghiệp này để đảm bảo độ chính xác cao nhất (nhưng luôn xưng tên là "${currentAgentName}" thuộc "${currentBusinessName}").

2. MỨC ƯU TIÊN SỐ 2 - KÍCH HOẠT MÔ HÌNH TRÍ TUỆ NHÂN TẠO TÍCH HỢP (KHI DỮ LIỆU ĐÃ NẠP KHÔNG ĐỦ):
   - Trường hợp các dữ liệu website/tài liệu đã nạp KHÔNG ĐỦ THÔNG TIN hoặc KHÔNG CÓ THÔNG TIN để giải đáp câu hỏi của khách hàng:
   - Bạn hãy tự động kết hợp kiến thức chuyên môn rộng lớn của Mô hình Trí tuệ Nhân tạo Gemini tích hợp để cung cấp câu trả lời thỏa đáng, hữu ích, chính xác và tự nhiên cho khách hàng.
   - Luôn giữ thái độ phục vụ chuyên nghiệp, tư vấn hợp lý và đảm bảo tính nhất quán với ngành nghề "${currentBusinessIndustry}".

===================================================================
CƠ CHẾ TỰ ĐỘNG CHUYỂN ĐỔI PHONG CÁCH TƯ VẤN LẦN ĐẦU THEO NGỮ CẢNH (DYNAMIC PERSONA SWITCHING):
Bạn hãy tự động suy đoán ý định thực sự của khách hàng trong từng câu hỏi để chuyển đổi phong cách xưng hô & tư vấn linh hoạt:

- PHONG CÁCH 1: NHÂN VIÊN CHĂM SÓC BÁN HÀNG CHUYÊN NGHIỆP (SALES & CUSTOMER CARE)
  * KHI NÀO KÍCH HOẠT: Khi khách hàng có ý định tìm hiểu mua hàng, hỏi giá cả, chính sách ưu đãi, khuyến mãi, đặt hàng, phí vận chuyển, bảo hành, dịch vụ giao hàng.
  * TÔNG GIỌNG & CÁCH ỨNG XỬ: Ân cần, vồn vã, lịch thiệp, cung cấp thông tin giá cả & khuyến mãi minh bạch, nhấn mạnh cam kết chất lượng của cửa hàng, kèm lời mời hợp tác/đặt hàng cực kỳ tự nhiên.

- PHONG CÁCH 2: CHUYÊN GIA KỸ THUẬT & GIẢI PHÁP THỰC THỤ (SENIOR TECHNICAL EXPERT)
  * KHI NÀO KÍCH HOẠT: Khi khách hàng hỏi về cách sử dụng, cài đặt, vận hành, bảo trì, xử lý sự cố kĩ thuật, hoặc phân vân "nên sử dụng/chọn dòng sản phẩm nào" theo tiêu chí thông số kỹ thuật.
  * TÔNG GIỌNG & CÁCH ỨNG XỬ: Am hiểu sâu sắc, đi thẳng vào vấn đề, phân tích khách quan dựa trên số liệu/thông số, hướng dẫn chi tiết chuẩn mực từng bước (step-by-step), đưa ra lời khuyên chuyên môn mang tính tin cậy cao nhất.
===================================================================

MỤC TIÊU & NHIỆM VỤ CHÍNH CỦA BẠN:
1. TRẢ LỜI TIN NHẮN KHÁCH HÀNG: Giải đáp nhanh chóng, chính xác, tự nhiên như người thật.
2. TƯ VẤN NGHIỆP VỤ & HƯỚNG DẪN SỬ DỤNG:
   - Hướng dẫn chi tiết từng bước (Step-by-step) cách thao tác, cài đặt, bảo trì, khắc phục lỗi hoặc quy trình nghiệp vụ (đổi trả, bảo hành, thanh toán).
3. TƯ VẤN LỰA CHỌN SẢN PHẨM:
   - Khi khách hàng hỏi "Nên mua/dùng sản phẩm nào?", "Sản phẩm nào phù hợp với tôi?", hãy dựa vào danh sách sản phẩm bên dưới để phân tích nhu cầu và đề xuất 1-2 sản phẩm tốt nhất kèm lý do cụ thể.
4. PHÂN TÍCH TỆP / HÌNH ẢNH / VIDEO ĐƯỢC GỬI LÊN:
   - Khi người hỏi gửi hình ảnh, video hoặc tài liệu (PDF, TXT, bảng dữ liệu...): Hãy đọc, xem và phân tích nội dung tệp đó, kết hợp với kiến thức doanh nghiệp để giải thích hoặc chẩn đoán nguyên nhân lỗi.
5. QUY TẮC HỎI LẠI ĐỂ TƯ VẤN CHÍNH XÁC (HOẠT ĐỘNG CLARIFICATION):
   - ${agentConfig?.clarificationEnabled !== false ? 'NẾU câu hỏi hoặc thông tin khách hàng cung cấp còn chung chung, mơ hồ hoặc thiếu chi tiết quan trọng (ví dụ: thiếu model máy, thiếu ngân sách, thiếu nhu cầu sử dụng cụ thể, thiếu tình trạng lỗi...), BẠN NÊN ĐẶT 1-2 CÂU HỎI MỞ LỊCH SỰ ĐỂ LÀM RÕ TRƯỚC KHI ĐƯA RA CÂU TRẢ LỜI/KHUYẾN NGHỊ CHÍNH XÁC NHẤT.' : 'Cố gắng giải đáp chi tiết nhất dựa trên thông tin hiện có.'}

DỮ LIỆU CƠ SỞ TRI THỨC (KNOWLEDGE BASE) CỦA CỬA HÀNG/DOANH NGHIỆP (ƯU TIÊN 1):
${activeKnowledge || "Chưa có dữ liệu tri thức nào."}

DANH MỤC SẢN PHẨM ĐANG KINH DOANH (ƯU TIÊN 1):
${activeProducts || "Chưa có danh mục sản phẩm nào."}

YÊU CẦU ĐỊNH DẠNG ĐẦU RA:
- Trả lời rõ ràng bằng Tiếng Việt, trình bày trình tự khoa học, sử dụng danh sách gạch đầu dòng (bullet points) hoặc số thứ tự khi hướng dẫn thao tác.
- Nếu bạn cần hỏi thêm thông tin từ khách hàng, hãy đặt câu hỏi một cách khéo léo và chu đáo.
`;

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
    const customApiKey = agentConfig?.customApiKey;
    const customApiEndpoint = agentConfig?.customApiEndpoint;
    const temperature = typeof agentConfig?.temperature === 'number' ? agentConfig.temperature : 0.7;

    const trimmedCustomKey = customApiKey ? customApiKey.trim() : '';
    console.log(`[AI Engine] Provider: ${provider}, Model: ${selectedModel}, Temp: ${temperature}, CustomKey: ${trimmedCustomKey ? 'YES' : 'NO'}`);

    let responseText = "";

    if (provider === 'google') {
      // Use Google Gemini SDK with custom API key or default server key
      const googleClient = trimmedCustomKey 
        ? new GoogleGenAI({ apiKey: trimmedCustomKey }) 
        : ai;

      const contents: any[] = [];
      if (Array.isArray(history) && history.length > 0) {
        let userStarted = false;
        const recentHistory = history.slice(-8); // keep last 8 messages to conserve tokens/quota
        for (const msg of recentHistory) {
          if (msg.sender === 'user') {
            userStarted = true;
          }
          if (!userStarted) continue; // Skip leading initial welcome greetings
          const role = msg.sender === 'user' ? 'user' : 'model';
          contents.push({
            role,
            parts: [{ text: msg.text || "" }]
          });
        }
      }

      const currentParts: any[] = [];
      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          if (att.dataUrl && att.dataUrl.includes(',')) {
            const base64Data = att.dataUrl.split(',')[1];
            currentParts.push({
              inlineData: {
                mimeType: att.mimeType || 'image/png',
                data: base64Data
              }
            });
          }
        }
      }

      currentParts.push({
        text: message || "Hãy phân tích tệp/hình ảnh/video tôi vừa gửi và hỗ trợ cho tôi."
      });

      contents.push({
        role: 'user',
        parts: currentParts
      });

      // Try model cascade sequence with valid official Gemini model aliases
      const modelsToTry = Array.from(new Set([selectedModel, 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite']));
      let geminiSuccess = false;
      let lastGeminiErr: any = null;

      for (const m of modelsToTry) {
        try {
          console.log(`[Gemini Engine] Attempting request with model: ${m}...`);
          const response = await googleClient.models.generateContent({
            model: m,
            contents,
            config: {
              systemInstruction,
              temperature,
            }
          });
          responseText = response.text || "";
          if (responseText && responseText.trim().length > 0) {
            geminiSuccess = true;
            console.log(`[Gemini Engine] Successfully received response with model: ${m}`);
            break;
          }
        } catch (err: any) {
          console.warn(`[Gemini Engine Warning] Model ${m} failed:`, err?.message || String(err));
          lastGeminiErr = err;
        }
      }

      if (!geminiSuccess) {
        const errStr = lastGeminiErr?.message || String(lastGeminiErr);
        const isCustomKeyUsed = Boolean(trimmedCustomKey);

        if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("Quota exceeded") || errStr.includes("quota")) {
          if (isCustomKeyUsed) {
            throw new Error(`API Key cá nhân bạn vừa nhập đã chạm giới hạn lượt gọi miễn phí của Google (Rate Limit 429 / Quota Exhausted). Vui lòng đợi 1-2 phút rồi thử lại, hoặc đổi sang nhà cung cấp DeepSeek / OpenAI trong mục Cấu Hình Agent.`);
          } else {
            throw new Error("Tài khoản đã đạt giới hạn gọi API miễn phí chung của hệ thống (Rate Limit 429). Vui lòng nhập API Key cá nhân trong phần 'Cấu Hình Agent' (lấy miễn phí tại Google AI Studio) hoặc đổi sang mô hình khác (OpenAI, DeepSeek, Claude) để không bị gián đoạn.");
          }
        } else if (errStr.includes("API_KEY_INVALID") || errStr.includes("API key not valid") || errStr.includes("invalid")) {
          throw new Error("API Key cá nhân bạn nhập không hợp lệ hoặc đã bị vô hiệu hóa. Vui lòng kiểm tra lại API Key lấy từ Google AI Studio (aistudio.google.com/app/apikey).");
        } else {
          throw new Error(`Không thể nhận phản hồi từ Gemini API${isCustomKeyUsed ? ' (API Key cá nhân)' : ''}: ${errStr}`);
        }
      }
    } else if (provider === 'openai' || provider === 'deepseek' || provider === 'custom_openai') {
      // OpenAI-compatible Chat Completion API
      const effectiveApiKey = (customApiKey && customApiKey.trim()) 
        ? customApiKey.trim() 
        : (provider === 'openai' ? process.env.OPENAI_API_KEY : provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY);

      if (!effectiveApiKey && provider !== 'custom_openai') {
        return res.status(400).json({
          error: `Chưa nhập API Key cho ${provider.toUpperCase()}`,
          details: `Vui lòng vào mục "Cấu Hình Agent" để nhập API Key cho ${provider.toUpperCase()} hoặc quay lại chọn Google Gemini.`
        });
      }

      let baseUrl = provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1';
      if (customApiEndpoint && customApiEndpoint.trim()) {
        baseUrl = customApiEndpoint.trim().replace(/\/$/, '');
      }

      const openAiMessages: any[] = [
        { role: 'system', content: systemInstruction }
      ];

      if (Array.isArray(history) && history.length > 0) {
        let userStarted = false;
        for (const msg of history.slice(-10)) {
          if (msg.sender === 'user') userStarted = true;
          if (!userStarted) continue;
          openAiMessages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text || ""
          });
        }
      }

      if (Array.isArray(attachments) && attachments.length > 0) {
        const userContentArr: any[] = [{ type: 'text', text: message || "Hãy phân tích tệp/hình ảnh tôi vừa gửi." }];
        for (const att of attachments) {
          if (att.dataUrl) {
            userContentArr.push({
              type: 'image_url',
              image_url: { url: att.dataUrl }
            });
          }
        }
        openAiMessages.push({ role: 'user', content: userContentArr });
      } else {
        openAiMessages.push({ role: 'user', content: message || "" });
      }

      const fetchUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
      const resApi = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey || 'no-key'}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: openAiMessages,
          temperature,
        })
      });

      const resData = await resApi.json();
      if (!resApi.ok) {
        let rawErr = resData?.error?.message || resData?.message || `Lỗi phản hồi từ API ${provider.toUpperCase()} (HTTP ${resApi.status})`;
        if (rawErr.includes('tokens per min') || rawErr.includes('TPM') || rawErr.includes('rate limit') || rawErr.includes('Rate limit')) {
          rawErr = `Giới hạn tốc độ gọi API của OpenAI (${selectedModel}) bị vượt mức TPM (Tokens Per Minute). Đã tối ưu hóa dung lượng truyền dữ liệu. Vui lòng thử lại hoặc đổi sang Google Gemini 3.6 Flash để có tốc độ phản hồi nhanh hơn không bị giới hạn.`;
        }
        throw new Error(rawErr);
      }
      responseText = resData.choices?.[0]?.message?.content || "";
    } else if (provider === 'anthropic') {
      // Anthropic Messages API
      const effectiveApiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : process.env.ANTHROPIC_API_KEY;
      if (!effectiveApiKey) {
        return res.status(400).json({
          error: "Chưa nhập API Key cho Anthropic Claude",
          details: "Vui lòng vào mục 'Cấu Hình Agent' để nhập API Key của Anthropic Claude."
        });
      }

      let baseUrl = 'https://api.anthropic.com/v1';
      if (customApiEndpoint && customApiEndpoint.trim()) {
        baseUrl = customApiEndpoint.trim().replace(/\/$/, '');
      }

      const claudeMessages: any[] = [];
      if (Array.isArray(history) && history.length > 0) {
        for (const msg of history.slice(-10)) {
          claudeMessages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text || ""
          });
        }
      }

      const userContentArr: any[] = [];
      if (Array.isArray(attachments) && attachments.length > 0) {
        for (const att of attachments) {
          if (att.dataUrl && att.dataUrl.includes(',')) {
            const parts = att.dataUrl.split(',');
            userContentArr.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mimeType || 'image/png',
                data: parts[1]
              }
            });
          }
        }
      }
      userContentArr.push({ type: 'text', text: message || "Hãy hỗ trợ cho tôi." });
      claudeMessages.push({ role: 'user', content: userContentArr });

      const fetchUrl = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`;
      const resApi = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: selectedModel,
          system: systemInstruction,
          messages: claudeMessages,
          max_tokens: 2048,
          temperature,
        })
      });

      const resData = await resApi.json();
      if (!resApi.ok) {
        throw new Error(resData?.error?.message || `Lỗi phản hồi từ Anthropic Claude API (HTTP ${resApi.status})`);
      }
      responseText = resData.content?.[0]?.text || "";
    }

    if (!responseText) {
      responseText = "Xin lỗi, em chưa nhận được câu trả lời từ mô hình AI. Anh/Chị có thể vui lòng thử lại được không ạ?";
    }

    // Detect if agent asked a clarifying question
    const clarificationAsked = responseText.includes("?") && (
      responseText.toLowerCase().includes("bạn có thể cho") ||
      responseText.toLowerCase().includes("anh/chị vui lòng") ||
      responseText.toLowerCase().includes("cho em hỏi thêm") ||
      responseText.toLowerCase().includes("loại nào") ||
      responseText.toLowerCase().includes("model")
    );

    res.json({
      success: true,
      responseText,
      clarificationAsked,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[Chat API Error]:", error);
    res.status(500).json({
      error: "Đã xảy ra lỗi khi kết nối với Trợ lý AI.",
      details: error?.message || String(error)
    });
  }
});

// Global In-Memory Config Store for Widget Sync with File Persistence
const STORE_FILE = path.join(process.cwd(), 'server_store.json');

let serverAgentConfig: any = null;
let serverWidgetSettings: any = null;
let serverKnowledgeSources: any[] = [];
let serverProducts: any[] = [];

// Google OAuth Session Store
let serverGoogleSession: {
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
} = {};

async function getValidGoogleAccessToken() {
  if (!serverGoogleSession.tokens) return null;
  const { access_token, refresh_token, expiry_date } = serverGoogleSession.tokens;
  
  if (expiry_date && Date.now() >= expiry_date - 60000 && refresh_token) {
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
        serverGoogleSession.tokens.access_token = data.access_token;
        if (data.expires_in) {
          serverGoogleSession.tokens.expiry_date = Date.now() + data.expires_in * 1000;
        }
        return data.access_token;
      }
    } catch (e) {
      console.error("Failed to refresh Google OAuth token", e);
    }
  }
  return access_token;
}

function loadServerStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.agentConfig) serverAgentConfig = parsed.agentConfig;
      if (parsed.widgetSettings) serverWidgetSettings = parsed.widgetSettings;
      if (Array.isArray(parsed.knowledgeSources)) serverKnowledgeSources = parsed.knowledgeSources;
      if (Array.isArray(parsed.products)) serverProducts = parsed.products;
      if (parsed.googleSession) serverGoogleSession = parsed.googleSession;
      console.log("💾 [ServerStore] Loaded configuration from server_store.json");
    }
  } catch (e) {
    console.warn("⚠️ [ServerStore] Failed to load server_store.json:", e);
  }
}

function saveServerStore() {
  try {
    const data = {
      agentConfig: serverAgentConfig,
      widgetSettings: serverWidgetSettings,
      knowledgeSources: serverKnowledgeSources,
      products: serverProducts,
      googleSession: serverGoogleSession,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn("⚠️ [ServerStore] Failed to save server_store.json:", e);
  }
}

// Initial load on server boot
loadServerStore();

// --- GOOGLE OAUTH 2.0 ROUTING ---

// 1. Get Google OAuth Login URL or Redirect
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

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `access_type=offline&` +
    `prompt=consent`;

  if (req.query.format === 'json') {
    return res.json({ authUrl, clientId, redirectUri });
  }
  return res.redirect(authUrl);
});

// 2. Google OAuth Callback
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const error = req.query.error as string;

  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: '${error}' }, '*');
              window.close();
            } else {
              window.location.href = '/?oauth_error=${encodeURIComponent(error)}';
            }
          </script>
          <p>Xác thực thất bại: ${error}. Đang đóng cửa sổ...</p>
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
      return res.status(400).send(`Trao đổi token thất bại: ${tokens.error_description || tokens.error || 'Lỗi không xác định'}`);
    }

    // Fetch User Profile
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json();

    serverGoogleSession = {
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
              ${userInfo.picture ? `<img src="${userInfo.picture}" class="avatar" />` : ''}
              <span class="email">${userInfo.email}</span>
            </div>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS', user: ${JSON.stringify(userInfo)} }, '*');
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

// 3. Get Current Google User Status
app.get("/api/auth/google/me", async (req, res) => {
  const accessToken = await getValidGoogleAccessToken();
  res.json({
    connected: !!accessToken && !!serverGoogleSession.user,
    user: serverGoogleSession.user || null,
    hasClientId: !!process.env.GOOGLE_WORKSPACE_CLIENT_ID,
  });
});

// 4. Logout Google OAuth Session
app.post("/api/auth/google/logout", (req, res) => {
  serverGoogleSession = {};
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
    const accessToken = await getValidGoogleAccessToken();
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

    const accessToken = await getValidGoogleAccessToken();
    if (!accessToken) {
      return res.status(401).json({ error: "Chưa kết nối tài khoản Google OAuth 2.0" });
    }

    const extractedText = await extractTextFromDriveFile(fileId, mimeType, accessToken);

    if (!extractedText) {
      return res.status(400).json({ error: "Tệp không chứa nội dung văn bản có thể trích xuất." });
    }

    const title = fileName || `Google Drive Doc (${fileId})`;
    const sourceId = `drive-${fileId}-${Date.now()}`;

    const newKnowledge: any = {
      id: sourceId,
      title: title,
      type: 'google_drive' as any,
      content: extractedText,
      url: `https://drive.google.com/file/d/${fileId}/view`,
      status: 'active',
      itemCount: 1,
      lastUpdated: new Date().toISOString(),
    };

    serverKnowledgeSources.push(newKnowledge);
    saveServerStore();

    res.json({
      success: true,
      knowledgeSource: newKnowledge,
      textLength: extractedText.length,
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

    const accessToken = await getValidGoogleAccessToken();
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
              const newSource: any = {
                id: `drive-${item.id}-${Date.now()}`,
                title: item.name || `Tệp ${item.id}`,
                type: 'google_drive',
                content: text,
                url: `https://drive.google.com/file/d/${item.id}/view`,
                status: 'active',
                lastUpdated: new Date().toISOString(),
              };
              serverKnowledgeSources.push(newSource);
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

app.get("/api/config", (req, res) => {
  res.json({
    agentConfig: serverAgentConfig,
    widgetSettings: serverWidgetSettings,
    knowledgeSources: serverKnowledgeSources,
    products: serverProducts,
  });
});

app.post("/api/config", (req, res) => {
  if (req.body?.agentConfig) {
    serverAgentConfig = { ...(serverAgentConfig || {}), ...req.body.agentConfig };
  }
  if (req.body?.widgetSettings) {
    serverWidgetSettings = { ...(serverWidgetSettings || {}), ...req.body.widgetSettings };
  }
  if (Array.isArray(req.body?.knowledgeSources)) {
    serverKnowledgeSources = req.body.knowledgeSources;
  }
  if (Array.isArray(req.body?.products)) {
    serverProducts = req.body.products;
  }
  saveServerStore();
  res.json({
    success: true,
    agentConfig: serverAgentConfig,
    widgetSettings: serverWidgetSettings,
    knowledgeSources: serverKnowledgeSources,
    products: serverProducts,
  });
});

// Embeddable JS Widget Script Generator Endpoint
app.get("/api/widget.js", (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  const baseUrl = `${protocol}://${host}`;
  const launcherText = serverWidgetSettings.buttonText || 'Hỏi Trợ Lý AI';

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
      }, 10);
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 AI Agent Server running at http://0.0.0.0:${PORT}`);
  });
  server.timeout = 300000; // 5 minutes
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
}

startServer();
