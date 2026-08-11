import { ChatParams, ProviderError } from './types';

// Adapter cho các API tương thích OpenAI: OpenAI, DeepSeek, và custom (Ollama/LM Studio/proxy).
// Key & endpoint chỉ lấy từ biến môi trường server.
export async function chatOpenAICompatible(p: ChatParams): Promise<string> {
  const provider = p.provider;
  const effectiveApiKey =
    provider === 'openai' ? process.env.OPENAI_API_KEY :
    provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY :
    (process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY);

  if (!effectiveApiKey && provider !== 'custom_openai') {
    throw new ProviderError(
      `Chưa cấu hình API Key cho ${provider.toUpperCase()} trên máy chủ`,
      400,
      `Quản trị viên cần đặt biến môi trường ${provider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY'} trên server, hoặc chọn Google Gemini.`
    );
  }

  let baseUrl = provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1';
  if (p.customApiEndpoint && p.customApiEndpoint.trim()) {
    baseUrl = p.customApiEndpoint.trim().replace(/\/$/, '');
  }

  const messages: any[] = [{ role: 'system', content: p.systemInstruction }];
  if (Array.isArray(p.history) && p.history.length > 0) {
    let userStarted = false;
    for (const msg of p.history.slice(-10)) {
      if (msg.sender === 'user') userStarted = true;
      if (!userStarted) continue;
      messages.push({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text || '' });
    }
  }

  if (Array.isArray(p.attachments) && p.attachments.length > 0) {
    const userContentArr: any[] = [{ type: 'text', text: p.message || 'Hãy phân tích tệp/hình ảnh tôi vừa gửi.' }];
    for (const att of p.attachments) {
      if (att.dataUrl) userContentArr.push({ type: 'image_url', image_url: { url: att.dataUrl } });
    }
    messages.push({ role: 'user', content: userContentArr });
  } else {
    messages.push({ role: 'user', content: p.message || '' });
  }

  const fetchUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const resApi = await fetch(fetchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${effectiveApiKey || 'no-key'}` },
    body: JSON.stringify({ model: p.model, messages, temperature: p.temperature }),
  });

  const resData = await resApi.json();
  if (!resApi.ok) {
    let rawErr = resData?.error?.message || resData?.message || `Lỗi phản hồi từ API ${provider.toUpperCase()} (HTTP ${resApi.status})`;
    if (/tokens per min|TPM|rate limit/i.test(rawErr)) {
      rawErr = `Giới hạn tốc độ gọi API ${provider.toUpperCase()} (${p.model}) bị vượt mức. Vui lòng thử lại hoặc đổi sang Google Gemini.`;
    }
    throw new Error(rawErr);
  }
  return resData.choices?.[0]?.message?.content || '';
}
