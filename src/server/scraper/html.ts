// Helper thuần cho crawl/scrape HTML (tách từ server.ts).

// Làm sạch HTML thành text đọc được.
export function cleanHtmlContent(html: string): string {
  if (!html) return "";
  const text = html
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

// Trích tiêu đề trang.
export function extractPageTitle(html: string, fallbackUrl: string): string {
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

// Trích các sub-link nội bộ (cùng domain) từ HTML.
export function extractInternalLinks(html: string, baseUrlStr: string): string[] {
  const links = new Set<string>();
  try {
    const baseUrl = new URL(baseUrlStr);
    const domainHost = baseUrl.hostname.toLowerCase();

    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[1].trim();

      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }
      if (/\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|doc|docx|zip|rar|tar|gz|mp4|mp3|avi|css|js|woff|woff2|ttf|eot)$/i.test(href)) {
        continue;
      }
      try {
        const resolvedUrl = new URL(href, baseUrlStr);
        if (resolvedUrl.hostname.toLowerCase() === domainHost) {
          resolvedUrl.hash = '';
          let cleanedHref = resolvedUrl.toString();
          if (cleanedHref.length > 10 && cleanedHref.endsWith('/')) {
            cleanedHref = cleanedHref.slice(0, -1);
          }
          links.add(cleanedHref);
        }
      } catch {
        // Ignore invalid URLs
      }
    }
  } catch (err) {
    console.warn('[Link Extractor] Failed to parse base URL:', err);
  }
  return Array.from(links);
}

// Lấy danh sách URL từ sitemap của domain (sitemap.xml, sitemap_index.xml, robots.txt).
export async function fetchSitemapUrls(baseUrlStr: string): Promise<{ urls: string[]; sitemapLocation?: string }> {
  const foundUrls = new Set<string>();
  let sitemapLoc: string | undefined = undefined;

  try {
    const baseUrl = new URL(baseUrlStr);
    const origin = baseUrl.origin;
    const domainHost = baseUrl.hostname.toLowerCase();

    const isDirectXml = baseUrlStr.toLowerCase().endsWith('.xml') || baseUrlStr.toLowerCase().includes('sitemap');
    const candidateSitemaps: string[] = [];

    if (isDirectXml) {
      candidateSitemaps.push(baseUrlStr);
    }

    candidateSitemaps.push(
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/sitemap-index.xml`,
      `${origin}/sitemap/sitemap.xml`
    );

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
      } catch {
        // Ignore robots fetch failure
      }
    }

    for (const smUrl of candidateSitemaps) {
      if (foundUrls.size >= 1200) break;
      try {
        const smRes = await fetch(smUrl, {
          headers: { 'User-Agent': 'aistudio-hybrid-crawler/1.0' },
          signal: AbortSignal.timeout(6000)
        });
        if (!smRes.ok) continue;
        const xmlText = await smRes.text();

        sitemapLoc = smUrl;

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
            } catch { /* ignore */ }
          }
        }

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
                    } catch { /* ignore */ }
                  }
                }
                return extracted;
              }
            } catch { /* ignore */ }
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

        if (foundUrls.size > 0) break;
      } catch { /* try next candidate */ }
    }
  } catch (err) {
    console.warn('[Sitemap Crawler] Error fetching sitemap:', err);
  }

  return { urls: Array.from(foundUrls), sitemapLocation: sitemapLoc };
}
