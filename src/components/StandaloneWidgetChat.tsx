import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Paperclip, 
  X, 
  RotateCcw, 
  Bot, 
  User, 
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  ChevronDown
} from 'lucide-react';
import { AgentConfig, Attachment, ChatMessage, KnowledgeSource, ProductItem, WidgetSettings } from '../types';
import { FormattedMessage } from './FormattedMessage';

interface StandaloneWidgetChatProps {
  agentConfig: AgentConfig;
  knowledgeSources: KnowledgeSource[];
  products: ProductItem[];
  widgetSettings?: WidgetSettings;
}

export const StandaloneWidgetChat: React.FC<StandaloneWidgetChatProps> = ({
  agentConfig: initialAgentConfig,
  knowledgeSources: initialKnowledgeSources,
  products: initialProducts,
  widgetSettings: initialWidgetSettings,
}) => {
  const [currentAgent, setCurrentAgent] = useState<AgentConfig>(() => {
    try {
      const saved = localStorage.getItem('aistudio_agent_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return initialAgentConfig;
  });

  const [currentSettings, setCurrentSettings] = useState<WidgetSettings | undefined>(() => {
    try {
      const saved = localStorage.getItem('aistudio_widget_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return initialWidgetSettings;
  });

  const [currentKnowledge, setCurrentKnowledge] = useState<KnowledgeSource[]>(initialKnowledgeSources);
  const [currentProducts, setCurrentProducts] = useState<ProductItem[]>(initialProducts);

  useEffect(() => {
    // [Tối ưu băng thông] Chỉ tải cấu hình NHẸ (persona + giao diện), KHÔNG tải toàn bộ kho tri thức.
    // Agent dùng tri thức ở phía máy chủ nên widget khách không cần tải kho -> tiết kiệm rất nhiều băng thông.
    fetch('/api/widget-config')
      .then((res) => res.json())
      .then((data) => {
        if (data.agentConfig && data.agentConfig.name) {
          setCurrentAgent((prev) => ({ ...prev, ...data.agentConfig }));
        }
        if (data.widgetSettings) {
          setCurrentSettings((prev) => ({ ...prev, ...data.widgetSettings }));
        }
      })
      .catch((err) => console.warn('Could not fetch /api/widget-config in standalone widget:', err));
  }, []);

  const primaryColor = currentSettings?.primaryColor || '#2563eb';
  const agentDisplayName = currentAgent.name || 'Trợ Lý AI';
  
  // Dynamically compute header title prioritizing updated agent businessName and agent name over legacy defaults
  const isDefaultHeader = !currentSettings?.headerTitle || currentSettings.headerTitle === 'Hỗ Trợ Khách Hàng TechLife' || currentSettings.headerTitle === 'Hỗ Trợ Khách Hàng AI';
  const widgetHeaderTitle = (!isDefaultHeader && currentSettings?.headerTitle)
    ? currentSettings.headerTitle
    : (currentAgent.businessName 
        ? `Hỗ Trợ Khách Hàng ${currentAgent.businessName}` 
        : (currentAgent.name ? `${currentAgent.name}` : 'Hỗ Trợ Khách Hàng AI'));

  const agentSubtitle = currentAgent.title || currentSettings?.subtitle || 'Trả lời tự động 24/7 bằng Trợ lý AI';
  const avatarUrl = currentAgent.avatarUrl;

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Hiện nút "xuống cuối" khi khách cuộn LÊN xem lịch sử; ẩn khi đã ở gần cuối.
  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollBtn(!nearBottom);
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('aistudio_widget_standalone_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load standalone widget messages:', e);
    }
    return [
      {
        id: 'w_welcome_1',
        sender: 'agent',
        text: currentAgent.greetingMessage || 'Xin chào! Em có thể giúp gì cho bạn hôm nay?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('aistudio_widget_standalone_messages', JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save standalone widget messages:', e);
    }
  }, [messages]);

  useEffect(() => {
    if (currentAgent.greetingMessage) {
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id === 'w_welcome_1') {
          if (prev[0].text !== currentAgent.greetingMessage) {
            return [{ ...prev[0], text: currentAgent.greetingMessage }];
          }
        }
        return prev;
      });
    }
  }, [currentAgent.greetingMessage]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Cuộn xuống CUỐI mỗi khi widget được mở (lúc ẩn scrollHeight=0 nên cuộn không ăn; mở lại không có tin nhắn mới
  // nên effect [messages] không chạy). Nhận tín hiệu 'AI_WIDGET_OPENED' từ trình bao + các sự kiện hiển thị/focus.
  useEffect(() => {
    const jumpToBottom = () => {
      // vài nhịp để chắc chắn layout đã hiện xong rồi mới cuộn (nhảy tức thì, không animation)
      setTimeout(() => scrollToBottom('auto'), 60);
      setTimeout(() => scrollToBottom('auto'), 250);
    };
    jumpToBottom(); // lần đầu mount
    const onMsg = (e: MessageEvent) => { if (e && e.data && e.data.type === 'AI_WIDGET_OPENED') jumpToBottom(); };
    const onVis = () => { if (!document.hidden) jumpToBottom(); };
    window.addEventListener('message', onMsg);
    window.addEventListener('focus', jumpToBottom);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('focus', jumpToBottom);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((f) => {
      const file = f as File;
      const reader = new FileReader();
      let type: 'image' | 'video' | 'document' = 'document';

      if (file.type.startsWith('image/')) {
        type = 'image';
      } else if (file.type.startsWith('video/')) {
        type = 'video';
      }

      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newAttachment: Attachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: file.name,
          type,
          mimeType: file.type || 'image/png',
          dataUrl,
          sizeBytes: file.size,
        };

        setAttachments((prev) => [...prev, newAttachment]);
      };

      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = textToSend !== undefined ? textToSend : inputText;
    if (!messageContent.trim() && attachments.length === 0) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: messageContent.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: [...attachments],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    const currentAttachments = [...attachments];
    setAttachments([]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // [Tối ưu băng thông] KHÔNG gửi kèm knowledgeSources/products nữa — máy chủ tự dùng kho tri thức phía server.
          message: userMessage.text,
          history: messages,
          agentConfig: currentAgent,
          attachments: currentAttachments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorText = data.details ? `${data.error} (${data.details})` : (data.error || 'Lỗi xử lý từ máy chủ');
        throw new Error(errorText);
      }

      const agentMessage: ChatMessage = {
        id: `msg_agent_${Date.now()}`,
        sender: 'agent',
        text: data.responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clarificationAsked: data.clarificationAsked,
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: any) {
      console.error('Widget Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'system',
        text: `⚠️ Khổng thể kết nối: ${err.message || 'Lỗi mạng'}. Vui lòng thử lại sau.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'w_welcome_1',
        sender: 'agent',
        text: currentAgent.greetingMessage || 'Xin chào! Em có thể giúp gì cho bạn hôm nay?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setAttachments([]);
  };

  return (
    <div className="w-full h-screen max-h-screen flex flex-col bg-slate-50 font-sans overflow-hidden border-0 relative">
      
      {/* Header Bar */}
      <header 
        className="px-4 py-3 text-white flex items-center justify-between shadow-md shrink-0 transition-colors"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={agentDisplayName}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/30 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold shrink-0 border border-white/30">
              <Bot className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
              <span>{widgetHeaderTitle}</span>
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-white/80 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{agentSubtitle}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleResetChat}
            title="Làm mới trò chuyện"
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'TOGGLE_AI_WIDGET', open: false }, '*');
              }
            }}
            title="Thu gọn khung chat"
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Chat Messages List */}
      <div ref={chatContainerRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 bg-slate-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2 max-w-[92%] ${
              msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            {/* Avatar */}
            {msg.sender === 'agent' && (
              avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={agentDisplayName}
                  className="w-7 h-7 rounded-full object-cover mt-0.5 shadow-xs shrink-0 ring-1 ring-slate-200"
                />
              ) : (
                <div 
                  className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 shadow-xs"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Bot className="w-4 h-4" />
                </div>
              )
            )}
            {msg.sender === 'user' && (
              <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 shadow-xs">
                <User className="w-4 h-4" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={`rounded-2xl p-3 text-xs leading-relaxed shadow-2xs ${
                msg.sender === 'user'
                  ? 'text-white rounded-tr-none'
                  : msg.sender === 'system'
                  ? 'bg-amber-50 text-amber-900 border border-amber-200/80 rounded-tl-none'
                  : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none'
              }`}
              style={msg.sender === 'user' ? { backgroundColor: primaryColor } : undefined}
            >
              {/* Attachments preview */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  {msg.attachments.map((att) => (
                    <div key={att.id} className="rounded-lg overflow-hidden border border-black/10">
                      {att.type === 'image' && (
                        <img src={att.dataUrl} alt={att.name} className="max-h-40 w-auto object-cover rounded-md" />
                      )}
                      {att.type !== 'image' && (
                        <div className="p-1.5 bg-black/5 text-[10px] font-mono flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          <span className="truncate">{att.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Message text */}
              <FormattedMessage content={msg.text} isAgent={msg.sender === 'agent'} />

              <div
                className={`text-[9px] mt-1 text-right ${
                  msg.sender === 'user' ? 'text-white/70' : 'text-slate-400'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={agentDisplayName}
                className="w-7 h-7 rounded-full object-cover shadow-xs shrink-0 ring-1 ring-slate-200 animate-pulse"
              />
            ) : (
              <div 
                className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs animate-spin"
                style={{ backgroundColor: primaryColor }}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            )}
            <div className="bg-white px-3 py-2 rounded-2xl border border-slate-200 text-slate-500 text-xs flex items-center gap-1.5 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-ping"></span>
              <span>{agentDisplayName} đang phản hồi...</span>
            </div>
          </div>
        )}
      </div>

      {/* Pending Attachments */}
      {attachments.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 flex flex-wrap gap-1.5 shrink-0">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="bg-white px-2 py-1 rounded-lg border border-slate-300 text-[10px] flex items-center gap-1 text-slate-700 shadow-2xs"
            >
              <span className="truncate max-w-[120px]">{att.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-slate-400 hover:text-rose-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Nút "xuống cuối" — chỉ hiện khi khách đã cuộn lên xem lịch sử */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={() => { scrollToBottom('smooth'); setShowScrollBtn(false); }}
          aria-label="Xuống tin nhắn mới nhất"
          title="Xuống tin nhắn mới nhất"
          className="absolute right-3 z-20 w-9 h-9 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          style={{ bottom: '78px', color: primaryColor }}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {/* Input Area */}
      <footer className="p-2.5 bg-white border-t border-slate-200 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept="image/*,.pdf,.txt,.doc,.docx"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Đính kèm tệp / ảnh"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={'Nhập câu hỏi của bạn...'}
            disabled={isLoading}
            className="flex-1 bg-slate-100 border-0 focus:ring-2 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all"
          />

          <button
            type="submit"
            disabled={isLoading || (!inputText.trim() && attachments.length === 0)}
            className="p-2 rounded-xl text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-1.5 text-center text-[9px] text-slate-400 flex items-center justify-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-500" />
          <span>Hỗ trợ trực tuyến bởi Trợ Lý AI</span>
        </div>
      </footer>

    </div>
  );
};
