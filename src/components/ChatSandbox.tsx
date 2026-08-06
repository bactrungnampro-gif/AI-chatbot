import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  FileText, 
  Video, 
  X, 
  RotateCcw, 
  HelpCircle, 
  Bot, 
  User, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  FileSearch,
  Upload
} from 'lucide-react';
import { AgentConfig, Attachment, ChatMessage, KnowledgeSource, ProductItem } from '../types';
import { FormattedMessage } from './FormattedMessage';

interface ChatSandboxProps {
  agentConfig: AgentConfig;
  knowledgeSources: KnowledgeSource[];
  products: ProductItem[];
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export const ChatSandbox: React.FC<ChatSandboxProps> = ({
  agentConfig,
  knowledgeSources,
  products,
  messages,
  setMessages,
}) => {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Handle File Selection (Images, Videos, Documents)
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
          mimeType: file.type || (type === 'image' ? 'image/png' : 'text/plain'),
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

  // Send Message to Server API
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
          message: userMessage.text,
          history: messages,
          agentConfig,
          knowledgeSources,
          products,
          attachments: currentAttachments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorText = data.details ? `${data.error} (${data.details})` : (data.error || 'Lỗi xử lý tin nhắn từ server');
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
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'system',
        text: `⚠️ Khổng thể kết nối với Agent: ${err.message || 'Lỗi mạng'}. Vui lòng kiểm tra lại cấu hình API.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    if (window.confirm('Bạn có chắc chắn muốn làm mới cuộc trò chuyện?')) {
      setMessages([
        {
          id: 'welcome_1',
          sender: 'agent',
          text: agentConfig.greetingMessage,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setAttachments([]);
    }
  };

  // Preset Prompts for fast testing
  const firstProductName = products.length > 0 ? products[0].name : 'sản phẩm';
  const samplePrompts = [
    `🖼️ Tư vấn ${firstProductName} và gửi kèm hình ảnh sản phẩm`,
    `🔗 ${firstProductName} có tính năng gì nổi bật? Cho tôi xin link bài viết chi tiết`,
    `🛍️ Giới thiệu các sản phẩm đang kinh doanh tại ${agentConfig.businessName || 'cửa hàng'}`,
    `🔧 Hướng dẫn quy trình bảo hành & hỗ trợ đổi trả sản phẩm`,
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Context Info & Quick Stats */}
        <div className="lg:col-span-1 space-y-4">
          
          {/* Data Hierarchy & Persona Switching Rule Notice */}
          <div className="bg-indigo-50/80 p-4 rounded-2xl border border-indigo-100 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Trí Tuệ AI Linh Hoạt theo Ngữ Cảnh</span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
              <div className="p-2 bg-white rounded-xl border border-indigo-100 space-y-1">
                <span className="font-bold text-indigo-900 block text-[10px] uppercase tracking-wider">1. Ưu Tiên Dữ Liệu Tra Cứu</span>
                <p className="text-slate-600 text-[11px]">Tra cứu dữ liệu Website & Tài liệu nạp trước. Nếu thiếu, Gemini AI tự động hỗ trợ.</p>
              </div>

              <div className="p-2 bg-white rounded-xl border border-indigo-100 space-y-1">
                <span className="font-bold text-emerald-800 block text-[10px] uppercase tracking-wider">2. Tự Động Chuyển Phong Cách</span>
                <div className="text-[10px] text-slate-600 space-y-0.5">
                  <p>• <b>Khách hỏi mua/giá</b> ➔ <i>Nhân viên Bán hàng Chuyên nghiệp</i></p>
                  <p>• <b>Khách hỏi kỹ thuật/sử dụng</b> ➔ <i>Chuyên gia Kỹ thuật Thực thụ</i></p>
                </div>
              </div>
            </div>

            {/* Quick Test Chips */}
            <div className="pt-1">
              <span className="text-[10px] font-bold text-indigo-900 block mb-1.5 uppercase">Thử Ngay 2 Phong Cách:</span>
              <div className="space-y-1">
                <button
                  onClick={() => setInputText('Sản phẩm máy lọc nước này giá bao nhiêu và đang có những chương trình ưu đãi, khuyến mãi gì vậy em?')}
                  className="w-full text-left p-1.5 bg-white hover:bg-indigo-100/60 rounded-lg text-[10px] text-indigo-800 font-medium border border-indigo-200 transition-colors flex items-center justify-between"
                >
                  <span>🛒 Thử Phong Cách Bán Hàng (Hỏi Giá)</span>
                  <span>➔</span>
                </button>
                <button
                  onClick={() => setInputText('Hướng dẫn tôi các bước vệ sinh màng lọc và bảo trì định kỳ cho máy này một cách chuẩn xác?')}
                  className="w-full text-left p-1.5 bg-white hover:bg-emerald-100/60 rounded-lg text-[10px] text-emerald-800 font-medium border border-emerald-200 transition-colors flex items-center justify-between"
                >
                  <span>🛠️ Thử Phong Cách Chuyên Gia (Kỹ Thuật)</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          </div>

          {/* Agent Persona Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <img
                src={agentConfig.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'}
                alt={agentConfig.name}
                className="w-12 h-12 rounded-xl object-cover ring-2 ring-indigo-500/20"
              />
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{agentConfig.name}</h3>
                <p className="text-xs text-slate-500">{agentConfig.title}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-[11px] text-emerald-700 font-medium capitalize">
                    Tone: {agentConfig.tone}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Tổ chức:</span>
                <span className="font-semibold text-slate-800">{agentConfig.businessName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tri thức chủ động:</span>
                <span className="font-semibold text-indigo-600">
                  {knowledgeSources.filter((k) => k.active).length} tệp / URL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sản phẩm tư vấn:</span>
                <span className="font-semibold text-indigo-600">{products.length} sản phẩm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Hỏi lại khi thiếu thông tin:</span>
                <span className={`font-semibold ${agentConfig.clarificationEnabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {agentConfig.clarificationEnabled ? 'Bật (Hỏi làm rõ)' : 'Tắt'}
                </span>
              </div>
            </div>
          </div>

          {/* Prompt Suggestions */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Gợi Ý Mẫu Dùng Thử</span>
            </div>
            <div className="space-y-2">
              {samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={isLoading}
                  className="w-full text-left p-2.5 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200 text-xs text-slate-700 hover:text-blue-700 transition-all hover:border-blue-200 shadow-2xs group"
                >
                  <span className="line-clamp-2">{prompt}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Multimodal Analysis Specs */}
          <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100">
            <h4 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-1.5">
              <FileSearch className="w-4 h-4 text-blue-600" />
              <span>Phân Tích Đa Phương Tiện</span>
            </h4>
            <p className="text-[11px] text-blue-800/80 leading-relaxed">
              Agent hỗ trợ tải lên <b>Hình ảnh (PNG/JPG)</b>, <b>Tài liệu (PDF, TXT)</b> và <b>Video ngắn</b>. Model Gemini 3.6 Flash sẽ kết hợp nội dung tệp đính kèm với dữ liệu tri thức cửa hàng để tư vấn chính xác.
            </p>
          </div>

        </div>

        {/* Right Column: Interactive Chat Interface */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[700px]">
          
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Phòng Thử Nghiệm Chat Agent</h2>
                <p className="text-xs text-slate-500">Trải nghiệm tương tác thời gian thực với cơ chế ưu tiên dữ liệu</p>
              </div>
            </div>

            <button
              onClick={handleResetChat}
              title="Làm mới chat"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Xoá & Bắt đầu lại</span>
            </button>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {messages.map((msg) => {
              const isAgent = msg.sender === 'agent';
              const isSystem = msg.sender === 'system';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-3 max-w-2xl mx-auto">
                    <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs shadow-2xs space-y-2 w-full">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold">{msg.text}</p>
                          {msg.text.includes('Rate Limit 429') && (
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                              💡 <b>Mẹo:</b> Vượt quá lượt gọi Gemini miễn phí từ Server chung. Bạn hãy chuyển sang mục <b>"Cấu Hình Agent"</b> ➔ Nhập <b>API Key cá nhân</b> (Google Gemini, OpenAI, Claude hoặc DeepSeek) để tiếp tục nhắn tin mượt mà không bị ngắt quãng.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-[85%] ${
                    isAgent ? 'self-start' : 'ml-auto flex-row-reverse'
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold ${
                    isAgent ? 'bg-indigo-600' : 'bg-slate-800'
                  }`}>
                    {isAgent ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>

                  {/* Bubble */}
                  <div className="space-y-1.5">
                    
                    {/* User Attachments Preview inside Bubble */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.attachments.map((att) => (
                          <div key={att.id} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 max-w-[200px]">
                            {att.type === 'image' && (
                              <img src={att.dataUrl} alt={att.name} className="max-h-40 object-cover w-full" />
                            )}
                            {att.type === 'video' && (
                              <video src={att.dataUrl} controls className="max-h-40 w-full" />
                            )}
                            {att.type === 'document' && (
                              <div className="p-3 flex items-center gap-2 text-xs font-medium text-slate-700">
                                <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                                <span className="truncate">{att.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div
                      className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-2xs ${
                        isAgent
                          ? 'bg-slate-100/90 text-slate-900 rounded-tl-xs border border-slate-200/60'
                          : 'bg-indigo-600 text-white rounded-tr-xs'
                      }`}
                    >
                      <FormattedMessage content={msg.text} isAgent={isAgent} />
                    </div>

                    {/* Clarification Indicator Badge */}
                    {isAgent && msg.clarificationAsked && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-md w-fit font-medium">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Agent đang đặt câu hỏi gợi mở để làm rõ yêu cầu</span>
                      </div>
                    )}

                    <div className={`text-[10px] text-slate-400 ${isAgent ? 'text-left' : 'text-right'}`}>
                      {msg.timestamp}
                    </div>

                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-3 items-center text-slate-500 text-xs italic">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center">
                  <Bot className="w-4 h-4 animate-bounce" />
                </div>
                <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></div>
                  <span>{agentConfig.name || 'Trợ Lý AI'} đang tra cứu dữ liệu & phân tích tệp để phản hồi...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Attached Files Banner Before Send */}
          {attachments.length > 0 && (
            <div className="px-6 py-2 bg-blue-50/80 border-t border-blue-100 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-semibold text-blue-800 shrink-0">Tệp sắp gửi ({attachments.length}):</span>
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-blue-200 text-xs text-slate-700 shrink-0">
                  {att.type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-blue-600" />}
                  {att.type === 'video' && <Video className="w-3.5 h-3.5 text-purple-600" />}
                  {att.type === 'document' && <FileText className="w-3.5 h-3.5 text-emerald-600" />}
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="text-slate-400 hover:text-red-500 ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Message Input Footer */}
          <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-end gap-2"
            >
              {/* File Upload Trigger Buttons */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
                accept="image/*,video/*,.pdf,.txt,.doc,.docx,.csv,.json"
              />

              <div className="flex gap-1 shrink-0 pb-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Tải lên tệp, hình ảnh, hoặc video"
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
              </div>

              {/* Text Area Input */}
              <div className="flex-1 relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Nhập câu hỏi, thắc mắc dịch vụ, hoặc nhờ tư vấn sản phẩm..."
                  rows={2}
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm resize-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || (!inputText.trim() && attachments.length === 0)}
                className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl transition-colors shadow-xs shrink-0 font-medium"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Mẹo: Bạn có thể ấn Shift + Enter để xuống dòng. Agent sẽ ưu tiên tra cứu dữ liệu từ Cơ sở tri thức của {agentConfig.businessName || 'Doanh Nghiệp'}.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
