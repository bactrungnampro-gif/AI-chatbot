import type { ChatParams } from './types';

// Adapter Google Gemini (dùng SDK @google/genai). Có cơ chế cascade thử nhiều model dự phòng.
// `ai` là client GoogleGenAI đã khởi tạo (server truyền vào — key lấy từ env).
export async function chatGemini(ai: any, p: ChatParams): Promise<string> {
  const contents: any[] = [];
  if (Array.isArray(p.history) && p.history.length > 0) {
    let userStarted = false;
    for (const msg of p.history.slice(-8)) {
      if (msg.sender === 'user') userStarted = true;
      if (!userStarted) continue; // bỏ lời chào mở đầu của agent
      contents.push({ role: msg.sender === 'user' ? 'user' : 'model', parts: [{ text: msg.text || '' }] });
    }
  }

  const currentParts: any[] = [];
  if (Array.isArray(p.attachments)) {
    for (const att of p.attachments) {
      if (att.dataUrl && att.dataUrl.includes(',')) {
        currentParts.push({ inlineData: { mimeType: att.mimeType || 'image/png', data: att.dataUrl.split(',')[1] } });
      }
    }
  }
  currentParts.push({ text: p.message || 'Hãy phân tích tệp/hình ảnh/video tôi vừa gửi và hỗ trợ cho tôi.' });
  contents.push({ role: 'user', parts: currentParts });

  const modelsToTry = Array.from(new Set([p.model, 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite']));
  let lastErr: any = null;
  for (const m of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents,
        config: { systemInstruction: p.systemInstruction, temperature: p.temperature },
      });
      const text = response.text || '';
      if (text && text.trim().length > 0) {
        console.log(`[Gemini] Nhận phản hồi thành công với model: ${m}`);
        return text;
      }
    } catch (err: any) {
      console.warn(`[Gemini] model ${m} lỗi:`, err?.message || String(err));
      lastErr = err;
    }
  }

  const errStr = lastErr?.message || String(lastErr);
  if (/429|RESOURCE_EXHAUSTED|Quota exceeded|quota/i.test(errStr)) {
    throw new Error("Đã đạt giới hạn gọi API Gemini (Rate Limit 429 / hết hạn ngạch). Vui lòng thử lại sau ít phút hoặc đổi mô hình (OpenAI/DeepSeek/Claude).");
  }
  if (/API_KEY_INVALID|API key not valid|invalid/i.test(errStr)) {
    throw new Error("API Key Gemini không hợp lệ hoặc chưa cấu hình đúng trên máy chủ (GEMINI_API_KEY).");
  }
  throw new Error("Không thể nhận phản hồi từ Gemini API: " + errStr);
}
