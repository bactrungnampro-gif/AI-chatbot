import { ChatParams, ProviderError } from './types';
import { chatGemini } from './gemini';
import { chatOpenAICompatible } from './openaiCompatible';
import { chatAnthropic } from './anthropic';

export { ProviderError } from './types';
export type { ChatParams } from './types';

// Chọn nhà cung cấp DỰ PHÒNG khi Gemini hết hạn mức: chỉ chọn provider ĐÃ có API key trên server.
// Thứ tự ưu tiên có thể chỉnh qua AI_FALLBACK_ORDER (mặc định openai,deepseek,anthropic).
// Ưu tiên OpenAI vì hỗ trợ ảnh (vision); DeepSeek không đọc được ảnh.
function pickFallbackProvider(): { provider: string; model: string } | null {
  const order = (process.env.AI_FALLBACK_ORDER || 'openai,deepseek,anthropic')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const prov of order) {
    if (prov === 'openai' && (process.env.OPENAI_API_KEY || '').trim())
      return { provider: 'openai', model: (process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini').trim() };
    if (prov === 'deepseek' && (process.env.DEEPSEEK_API_KEY || '').trim())
      return { provider: 'deepseek', model: (process.env.DEEPSEEK_FALLBACK_MODEL || 'deepseek-chat').trim() };
    if (prov === 'anthropic' && (process.env.ANTHROPIC_API_KEY || '').trim())
      return { provider: 'anthropic', model: (process.env.ANTHROPIC_FALLBACK_MODEL || 'claude-3-5-haiku-20241022').trim() };
  }
  return null;
}

function isQuotaError(err: any): boolean {
  const msg = err?.message || String(err || '');
  return /429|quota|hạn ng|hết hạn ng|RESOURCE_EXHAUSTED|Rate Limit|rate limit/i.test(msg);
}

// Điều phối gọi đúng adapter theo provider. `geminiClient` chỉ cần cho provider 'google'.
export async function generateChatResponse(p: ChatParams, geminiClient?: any): Promise<string> {
  switch (p.provider) {
    case 'google':
      try {
        return await chatGemini(geminiClient, p);
      } catch (err: any) {
        // [Bền vững] Gemini hết hạn mức (free-tier 20 lượt/ngày) -> tự chuyển sang provider dự phòng nếu server có key.
        // Nhờ vậy khách vẫn được trả lời thay vì gặp lỗi khi Gemini cạn quota.
        if (isQuotaError(err)) {
          const fb = pickFallbackProvider();
          if (fb) {
            console.warn(`[AI] Gemini hết hạn mức -> tự chuyển sang ${fb.provider} (${fb.model}).`);
            const fbParams = { ...p, provider: fb.provider as any, model: fb.model };
            try {
              if (fb.provider === 'anthropic') return await chatAnthropic(fbParams);
              return await chatOpenAICompatible(fbParams);
            } catch (fbErr: any) {
              console.warn(`[AI] Provider dự phòng ${fb.provider} cũng lỗi:`, fbErr?.message || fbErr);
              throw err; // trả về lỗi Gemini gốc (thông điệp thân thiện) để không lộ chi tiết nội bộ
            }
          }
        }
        throw err;
      }
    case 'openai':
    case 'deepseek':
    case 'custom_openai':
      return chatOpenAICompatible(p);
    case 'anthropic':
      return chatAnthropic(p);
    default:
      throw new ProviderError('Nhà cung cấp AI không được hỗ trợ: ' + p.provider, 400);
  }
}
