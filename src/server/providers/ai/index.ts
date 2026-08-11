import { ChatParams, ProviderError } from './types';
import { chatGemini } from './gemini';
import { chatOpenAICompatible } from './openaiCompatible';
import { chatAnthropic } from './anthropic';

export { ProviderError } from './types';
export type { ChatParams } from './types';

// Điều phối gọi đúng adapter theo provider. `geminiClient` chỉ cần cho provider 'google'.
export async function generateChatResponse(p: ChatParams, geminiClient?: any): Promise<string> {
  switch (p.provider) {
    case 'google':
      return chatGemini(geminiClient, p);
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
