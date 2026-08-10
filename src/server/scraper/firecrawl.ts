// Tích hợp Firecrawl AI (tách từ server.ts).
import { extractPageTitle, cleanHtmlContent } from './html';

export async function testFirecrawlApiKey(apiKey: string): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: "API Key Firecrawl không được để trống." };
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com",
        formats: ["markdown"]
      }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json();
    if (res.ok && data.success !== false) {
      return { success: true, message: "🎉 XÁC THỰC THÀNH CÔNG! API Key Firecrawl hoạt động hoàn hảo." };
    } else {
      return {
        success: false,
        error: data.error || data.message || `Xác thực Firecrawl thất bại (Mã HTTP ${res.status}). Vui lòng kiểm tra lại Key hoặc hạn ngạch tài khoản.`
      };
    }
  } catch (err: any) {
    return { success: false, error: "Lỗi kết nối tới máy chủ Firecrawl API: " + (err.message || String(err)) };
  }
}

export async function scrapeSingleWithFirecrawl(targetUrl: string, apiKey: string) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: targetUrl,
      formats: ["markdown", "html"],
      onlyMainContent: true
    }),
    signal: AbortSignal.timeout(22000)
  });

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `Lỗi Firecrawl Scrape (HTTP ${res.status})`);
  }

  const markdown = data.data?.markdown || "";
  const html = data.data?.html || "";
  const metadata = data.data?.metadata || {};
  const title = metadata.title || extractPageTitle(html, targetUrl) || targetUrl;
  const description = metadata.description || "";
  const finalContent = markdown.trim() ? markdown : cleanHtmlContent(html);

  return {
    title,
    description,
    content: finalContent,
    url: metadata.sourceURL || targetUrl
  };
}

export async function mapUrlsWithFirecrawl(targetUrl: string, apiKey: string, limit: number = 50): Promise<string[]> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: targetUrl,
        limit: Math.min(limit, 300)
      }),
      signal: AbortSignal.timeout(15000)
    });

    const data = await res.json();
    if (res.ok && data.success !== false && Array.isArray(data.links)) {
      return data.links;
    }
  } catch (e) {
    console.warn("[Firecrawl Map Error]", e);
  }
  return [];
}
