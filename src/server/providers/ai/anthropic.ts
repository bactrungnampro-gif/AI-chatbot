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

  // [Fix H1] Anthropic Messages API YÊU CẦU: tin nhắn đầu là 'user' và role xen kẽ user/assistant.
  // -> Bỏ lời chào mở đầu của agent (như adapter Gemini/OpenAI), và GỘP các lượt cùng role liền nhau.
  const messages: any[] = [];
  const pushMsg = (role: 'user' | 'assistant', content: any) => {
    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      if (typeof last.content === 'string' && typeof content === 'string') {
        last.content = last.content + '\n' + content;
      } else {
        const arr = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content || '') }];
        const add = Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }];
        last.content = [...arr, ...add];
      }
    } else {
      messages.push({ role, content });
    }
  };

  if (Array.isArray(p.history) && p.history.length > 0) {
    let userStarted = false;
    for (const msg of p.history.slice(-10)) {
      if (msg.sender === 'user') userStarted = true;
      if (!userStarted) continue; // bỏ lời chào mở đầu của agent
      pushMsg(msg.sender === 'user' ? 'user' : 'assistant', msg.text || '');
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
  pushMsg('user', userContentArr);

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
