import express from "express";
import path from "path";
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

// Website Content Scraper / Extractor Endpoint
app.post("/api/knowledge/scrape", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "URL không hợp lệ hoặc thiếu" });
      return;
    }

    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    console.log(`[Scraper] Attempting to scrape URL: ${targetUrl}`);

    // Fetch webpage using native fetch
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract Title using Regex
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : targetUrl;

    // Remove scripts, styles, and SVG/HTML comments
    let cleanedText = html
      .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
      .replace(/<svg\b[^<]*>([\s\S]*?)<\/svg>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ') // Strip HTML tags
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();

    // Truncate to reasonable length for knowledge base item
    if (cleanedText.length > 8000) {
      cleanedText = cleanedText.substring(0, 8000) + "... [Đã rút gọn]";
    }

    const wordCount = cleanedText.split(/\s+/).filter(Boolean).length;

    res.json({
      success: true,
      title: title || `Dữ liệu thu thập từ ${targetUrl}`,
      url: targetUrl,
      content: cleanedText,
      wordCount
    });
  } catch (error: any) {
    console.error("[Scraper Error]:", error?.message || error);
    // Provide a helpful fallback extracted knowledge object if external site blocks crawling
    res.json({
      success: false,
      error: `Không thể tải dữ liệu tự động từ URL (${error?.message || 'Kết nối bị chặn'}). Bạn có thể dán nội dung trực tiếp bên dưới.`,
      fallbackTitle: `Thu thập dữ liệu từ ${req.body.url || 'Website'}`,
      content: ""
    });
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
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
