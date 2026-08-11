import { ChatParams, ProviderError } from './types';

// Adapter Anthropic Claude (Messages API). Key chỉ lấy từ env server.
export async function chatAnthropic(p: ChatParams): Promise<string> {
  const effectiveApiKey = process.env.ANTHROPIC_API_KEY;
  if (!effectiveApiKey) {
    throw new ProviderError(
      "Chưa cấu hình API Key cho Anthropic Claude trên máy chủ",
      400,
      "Quản trị viên cần đặt biến môi trường ANTHROPIC_API_KEY trên server."
    );
  }

  let baseUrl = 'https://api.anthropic.com/v1';
  if (p.customApiEndpoint && p.customApiEndpoint.trim()) {
    baseUrl = p.customApiEndpoint.trim().replace(/\/$/, '');
  }

  const messages: any[] = [];
  if (Array.isArray(p.history) && p.history.length > 0) {
    for (const msg of p.history.slice(-10)) {
      messages.push({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text || '' });
    }
  }

  const userContentArr: any[] = [];
  if (Array.isArray(p.attachments) && p.attachments.length > 0) {
    for (const att of p.attachments) {
      if (att.dataUrl && att.dataUrl.includes(',')) {
        userContentArr.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mimeType || 'image/png', data: att.dataUrl.split(',')[1] },
        });
      }
    }
  }
  userContentArr.push({ type: 'text', text: p.message || 'Hãy hỗ trợ cho tôi.' });
  messages.push({ role: 'user', content: userContentArr });

  const fetchUrl = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`;
  const resApi = await fetch(fetchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': effectiveApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: p.model, system: p.systemInstruction, messages, max_tokens: 2048, temperature: p.temperature }),
  });

  const resData = await resApi.json();
  if (!resApi.ok) {
    throw new Error(resData?.error?.message || `Lỗi phản hồi từ Anthropic Claude API (HTTP ${resApi.status})`);
  }
  return resData.content?.[0]?.text || '';
}
