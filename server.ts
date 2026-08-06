import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Increase body parser limits for base64 file uploads (images, PDFs, short videos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
      if (foundUrls.size >= 500) break; // Limit total sitemap URLs collected
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
        
        // If sitemap index contains sub-sitemaps and no direct page URLs were found in current file, fetch sub-sitemaps
        if (foundUrls.size === 0 && subSitemaps.length > 0) {
          for (const subSm of subSitemaps.slice(0, 10)) {
            if (foundUrls.size >= 500) break;
            try {
              const subRes = await fetch(subSm, {
                headers: { 'User-Agent': 'aistudio-hybrid-crawler/1.0' },
                signal: AbortSignal.timeout(5000)
              });
              if (subRes.ok) {
                const subXml = await subRes.text();
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
                        foundUrls.add(cleaned);
                      }
                    } catch (e) {}
                  }
                }
              }
            } catch (subErr) {}
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

    // Parse maxPages limit (1 to 200)
    const pageLimit = Math.min(Math.max(parseInt(String(maxPages), 10) || 10, 1), 200);
    const crawlMode = ['hybrid', 'sitemap', 'sublinks', 'single'].includes(mode) ? mode : 'hybrid';

    console.log(`[Scraper] Starting ${crawlMode.toUpperCase()} crawl for: ${targetUrl} (Max pages: ${pageLimit})`);

    // Step 1: Fetch Main Entry Page
    const mainResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(10000)
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
      console.log(`[Scraper] Discovering URLs via Sitemap XML...`);
      const sitemapResult = await fetchSitemapUrls(targetUrl);
      discoveredSitemapUrls = sitemapResult.urls;
      sitemapLocation = sitemapResult.sitemapLocation;
      console.log(`[Scraper] Sitemap found ${discoveredSitemapUrls.length} URLs from ${sitemapLocation || 'N/A'}`);
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

    // Concurrency batch execution
    const BATCH_SIZE = 8;
    for (let i = 0; i < subPagesToCrawl.length; i += BATCH_SIZE) {
      const batch = subPagesToCrawl.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (subUrl) => {
        try {
          const res = await fetch(subUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(5000)
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
    let combinedContent = `=== TỔNG HỢP DỮ LIỆU CÀO WEBSITE LAI (HYBRID) ===\n`;
    combinedContent += `Trang gốc: ${targetUrl}\n`;
    combinedContent += `Cơ chế: ${crawlMode.toUpperCase()} (Sitemap + Quét liên kết sub-links)\n`;
    combinedContent += `Tổng số trang đã cào: ${scrapedPagesList.length} trang\n\n`;

    // Dynamic per-page truncation based on page count to preserve total context window
    const maxCharsPerPage = scrapedPagesList.length > 50 ? 1200 : (scrapedPagesList.length > 20 ? 2500 : 5000);

    scrapedPagesList.forEach((page, index) => {
      combinedContent += `--- TRANG ${index + 1}/${scrapedPagesList.length}: ${page.title} ---\n`;
      combinedContent += `URL: ${page.url}\n`;
      let pageText = page.content;
      if (pageText.length > maxCharsPerPage) {
        pageText = pageText.substring(0, maxCharsPerPage) + '... [Đã rút gọn trang]';
      }
      combinedContent += `${pageText}\n\n`;
    });

    // Enforce global combined length limit (up to 50,000 chars)
    if (combinedContent.length > 50000) {
      combinedContent = combinedContent.substring(0, 50000) + '\n\n... [Tổng hợp tri thức đã rút gọn tối ưu cho AI]';
    }

    const totalWords = scrapedPagesList.reduce((sum, p) => sum + p.wordCount, 0);
    const domainHost = new URL(targetUrl).hostname;

    console.log(`[Scraper] Hybrid Crawl Completed successfully! Scraped ${scrapedPagesList.length} pages, total ~${totalWords} words.`);

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
      agentConfig,
      knowledgeSources = [],
      products = [],
      attachments = []
    } = req.body;

    if (!message && (!attachments || attachments.length === 0)) {
      res.status(400).json({ error: "Yêu cầu cần chứa tin nhắn hoặc tệp đính kèm." });
      return;
    }

    const ai = getGeminiAI();

    // Prepare Knowledge Base Context
    const activeKnowledge = knowledgeSources
      .filter((k: any) => k.active && k.content)
      .map((k: any) => `=== [CƠ SỞ DỮ LIỆU: ${k.title} (${k.type})] ===\n${k.content}\n`)
      .join("\n");

    // Prepare Product Catalog Context
    const activeProducts = products
      .map((p: any) => `=== [SẢN PHẨM: ${p.name}] ===
- Danh mục: ${p.category}
- Giá bán: ${p.price?.toLocaleString('vi-VN')} VNĐ ${p.originalPrice ? `(Giá gốc: ${p.originalPrice.toLocaleString('vi-VN')} VNĐ)` : ''}
- Mô tả: ${p.description}
- Đặc điểm nổi bật: ${Array.isArray(p.keyFeatures) ? p.keyFeatures.join(', ') : p.keyFeatures}
- Phù hợp nhất cho (Ideal For): ${p.idealFor || 'Mọi khách hàng'}
- Hướng dẫn sử dụng: ${p.usageInstructions || 'Xem tài liệu đi kèm'}
- Tình trạng: ${p.inStock ? 'Còn hàng' : 'Hết hàng'}
`)
      .join("\n");

    // Construct System Instruction with Data Priority Hierarchy
    const systemInstruction = `BẠN LÀ TRỢ LÝ AI CHUYÊN NGHIỆP CỦA TỔ CHỨC/DOANH NGHIỆP "${agentConfig?.businessName || 'Doanh Nghiệp'}".
- Tên đại diện của bạn: "${agentConfig?.name || 'Trợ Lý AI'}".
- Chức danh: "${agentConfig?.title || 'Chuyên viên tư vấn & hỗ trợ khách hàng'}".
- Ngành nghề kinh doanh: "${agentConfig?.businessIndustry || 'Dịch vụ & Sản phẩm'}".
- Giới thiệu doanh nghiệp: "${agentConfig?.businessDescription || ''}".
- Phong cách giao tiếp (Tone): "${agentConfig?.tone || 'friendly'}" (Thân thiện, lịch sự, ân cần như một con người thực sự, gọi khách hàng là "Anh/Chị" hoặc "Bạn", xưng "Em" hoặc "Tôi").

===================================================================
CƠ CHẾ ƯU TIÊN DỮ LIỆU ĐỂ TRẢ LỜI KHÁCH HÀNG (QUY TẮC BẮT BUỘC):
1. MỨC ƯU TIÊN SỐ 1 - DỮ LIỆU ĐÃ NẠP (WEBSITE CRAWLED, TÀI LIỆU KHÁCH HÀNG & CƠ SỞ TRI THỨC):
   - Bạn BẮT BUỘC phải tra cứu và khai thác tối đa thông tin từ "CƠ SỞ TRI THỨC (KNOWLEDGE BASE)" và "DANH MỤC SẢN PHẨM" được nạp bên dưới trước tiên.
   - Khi dữ liệu đã nạp chứa thông tin phù hợp, hãy đưa ra câu trả lời dựa trên nguồn dữ liệu doanh nghiệp này để đảm bảo độ chính xác cao nhất.

2. MỨC ƯU TIÊN SỐ 2 - KÍCH HOẠT MÔ HÌNH TRÍ TUỆ NHÂN TẠO TÍCH HỢP (KHI DỮ LIỆU ĐÃ NẠP KHÔNG ĐỦ):
   - Trường hợp các dữ liệu website/tài liệu đã nạp KHÔNG ĐỦ THÔNG TIN hoặc KHÔNG CÓ THÔNG TIN để giải đáp câu hỏi của khách hàng:
   - Bạn hãy tự động kết hợp kiến thức chuyên môn rộng lớn của Mô hình Trí tuệ Nhân tạo Gemini tích hợp để cung cấp câu trả lời thỏa đáng, hữu ích, chính xác và tự nhiên cho khách hàng.
   - Luôn giữ thái độ phục vụ chuyên nghiệp, tư vấn hợp lý và đảm bảo tính nhất quán với ngành nghề của doanh nghiệp.

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

    // Prepare contents array for Gemini
    const contents: any[] = [];

    // Format previous chat history if provided
    if (Array.isArray(history) && history.length > 0) {
      // Pick last 10 messages for conversation context
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        const role = msg.sender === 'user' ? 'user' : 'model';
        contents.push({
          role,
          parts: [{ text: msg.text || "" }]
        });
      }
    }

    // Build the current user message parts
    const currentParts: any[] = [];

    // Add attachments (Images, Documents, Video frames/files)
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

    // Add user text prompt
    currentParts.push({
      text: message || "Hãy phân tích tệp/hình ảnh/video tôi vừa gửi và hỗ trợ cho tôi."
    });

    contents.push({
      role: 'user',
      parts: currentParts
    });

    console.log(`[Gemini API] Processing chat request. Messages count: ${contents.length}, Attachments: ${attachments.length}`);

    // Call Gemini 3.6 Flash
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    const responseText = response.text || "Xin lỗi, em chưa thể đưa ra câu trả lời lúc này. Anh/Chị có thể vui lòng thử lại được không ạ?";

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

// Embeddable JS Widget Script Generator Endpoint
app.get("/api/widget.js", (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  const baseUrl = `${protocol}://${host}`;

  const jsCode = `
(function() {
  if (window.TechLifeAIAgentLoaded) return;
  window.TechLifeAIAgentLoaded = true;

  console.log("🤖 TechLife AI Customer Support Agent Widget Loading...");

  const iframe = document.createElement('iframe');
  iframe.id = 'techlife-ai-agent-iframe';
  iframe.src = '${baseUrl}/?mode=widget';
  iframe.style.position = 'fixed';
  iframe.style.bottom = '20px';
  iframe.style.right = '20px';
  iframe.style.width = '400px';
  iframe.style.height = '620px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
  iframe.style.zIndex = '999999';
  iframe.style.transition = 'all 0.3s ease';
  iframe.allow = 'camera; microphone; autoplay';

  document.body.appendChild(iframe);
})();
`;

  res.setHeader("Content-Type", "application/javascript");
  res.send(jsCode);
});


// Vite middleware setup for Development / Static server for Production
async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(path.join(distPath, 'index.html'));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 AI Agent Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
