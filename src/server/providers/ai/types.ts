// Kiểu dữ liệu chung cho tầng AI providers (tách khỏi /api/chat).

export interface HistoryMsg { sender: string; text?: string }
export interface Attachment { dataUrl?: string; mimeType?: string }

export interface ChatParams {
  provider: string;            // 'google' | 'openai' | 'deepseek' | 'anthropic' | 'custom_openai'
  model: string;
  systemInstruction: string;
  history: HistoryMsg[];
  message: string;
  attachments: Attachment[];
  temperature: number;
  customApiEndpoint?: string;  // endpoint override (OpenAI-compatible/Ollama) — từ env server
}

// Lỗi có mã HTTP để controller trả đúng status (vd 400 khi thiếu API key).
export class ProviderError extends Error {
  status: number;
  details?: string;
  constructor(message: string, status = 500, details?: string) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.details = details;
  }
}
