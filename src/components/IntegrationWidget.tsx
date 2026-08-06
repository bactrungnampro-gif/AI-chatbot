import React, { useState } from 'react';
import { 
  Code2, 
  Copy, 
  Check, 
  Bot, 
  MessageSquare, 
  X, 
  Palette, 
  Globe, 
  Layers,
  Sparkles,
  Send,
  Paperclip,
  Store,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { AgentConfig, ChatMessage, WidgetSettings } from '../types';
import { FormattedMessage } from './FormattedMessage';

interface IntegrationWidgetProps {
  agentConfig: AgentConfig;
  widgetSettings: WidgetSettings;
  setWidgetSettings: React.Dispatch<React.SetStateAction<WidgetSettings>>;
}

export const IntegrationWidget: React.FC<IntegrationWidgetProps> = ({
  agentConfig,
  widgetSettings,
  setWidgetSettings,
}) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'sapo' | 'haravan' | 'wordpress' | 'ladipage'>('sapo');

  // Widget preview messaging
  const [widgetInput, setWidgetInput] = useState('');
  const [widgetMessages, setWidgetMessages] = useState<ChatMessage[]>([
    {
      id: 'w_msg_1',
      sender: 'agent',
      text: agentConfig.greetingMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const currentHost = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

  const scriptCode = `<script src="${currentHost}/api/widget.js" async></script>`;

  const iframeCode = `<iframe
  src="${currentHost}/?mode=widget"
  style="width: 380px; height: 600px; border: none; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);"
  allow="microphone; camera"
></iframe>`;

  const copyToClipboard = (text: string, type: 'script' | 'iframe') => {
    navigator.clipboard.writeText(text);
    if (type === 'script') {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } else {
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    }
  };

  const colorPresets = [
    { name: 'Royal Blue', hex: '#2563eb' },
    { name: 'Emerald', hex: '#059669' },
    { name: 'Purple', hex: '#7c3aed' },
    { name: 'Rose', hex: '#e11d48' },
    { name: 'Dark Slate', hex: '#0f172a' },
  ];

  const handleWidgetSend = () => {
    if (!widgetInput.trim()) return;
    const userMsg: ChatMessage = {
      id: `w_user_${Date.now()}`,
      sender: 'user',
      text: widgetInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const replyMsg: ChatMessage = {
      id: `w_agent_${Date.now()}`,
      sender: 'agent',
      text: 'Cảm ơn bạn! Em đã nhận thông tin và đang tra cứu từ dữ liệu cửa hàng để hỗ trợ bạn.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setWidgetMessages((prev) => [...prev, userMsg, replyMsg]);
    setWidgetInput('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
          <Code2 className="w-3.5 h-3.5" />
          <span>Tích Hợp Dễ Dàng Chỉ Với 1 Dòng Mã</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Mã Nhúng Widget Website Khách Hàng</h2>
        <p className="text-xs text-slate-500 mt-1">
          Chỉ cần sao chép đoạn mã JavaScript bên dưới dán vào mã nguồn website WordPress, Shopify, LadiPage, React hoặc HTML bất kỳ để Agent xuất hiện hỗ trợ khách hàng ngay lập tức.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Embed Code & Styling Settings */}
        <div className="space-y-6">
          
          {/* Script Code Card */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <Code2 className="w-4 h-4" />
                Mã Nhúng Script (Khuyên Dùng)
              </span>
              <button
                onClick={() => copyToClipboard(scriptCode, 'script')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Đã Sao Chép!' : 'Sao Chép Mã'}</span>
              </button>
            </div>

            <pre className="bg-slate-950 p-3.5 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800">
              <code>{scriptCode}</code>
            </pre>

            <p className="text-[11px] text-slate-400">
              Dán đoạn mã này vào trước thẻ <code className="text-amber-300">&lt;/head&gt;</code> hoặc <code className="text-amber-300">&lt;/body&gt;</code> trên trang web của bạn.
            </p>
          </div>

          {/* iFrame Code Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                Mã Nhúng dạng iFrame Khung Nhỏ
              </span>
              <button
                onClick={() => copyToClipboard(iframeCode, 'iframe')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                {copiedIframe ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIframe ? 'Đã Sao Chép!' : 'Sao Chép iFrame'}</span>
              </button>
            </div>

            <pre className="bg-slate-50 p-3.5 rounded-xl text-slate-800 font-mono text-[11px] overflow-x-auto border border-slate-200">
              <code>{iframeCode}</code>
            </pre>
          </div>

          {/* Platform Integration Detailed Guide */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>Hướng Dẫn Nhúng Chi Tiết Cho Từng Nền Tảng Website</span>
              </h3>
            </div>

            {/* Platform Selector Tabs */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'sapo', name: 'Sapo Web', badge: 'Phổ biến' },
                { id: 'haravan', name: 'Haravan', badge: '' },
                { id: 'wordpress', name: 'WordPress', badge: '' },
                { id: 'ladipage', name: 'LadiPage', badge: '' },
              ].map((plat) => (
                <button
                  key={plat.id}
                  onClick={() => setActivePlatform(plat.id as any)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activePlatform === plat.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>{plat.name}</span>
                  {plat.badge && (
                    <span className="text-[9px] bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded-md font-bold">
                      {plat.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Instruction Steps according to activePlatform */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3 text-xs">
              {activePlatform === 'sapo' && (
                <div className="space-y-2.5">
                  <div className="font-bold text-indigo-950 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px]">1</span>
                    <span>Hướng dẫn tích hợp AI Chatbot vào Sapo Web:</span>
                  </div>
                  <ol className="list-decimal pl-5 space-y-2 text-slate-700 leading-relaxed">
                    <li>
                      <strong>Sao chép mã Script:</strong> Bấm nút <span className="text-blue-600 font-semibold">Sao Chép Mã</span> ở khung Script màu đen phía trên.
                    </li>
                    <li>
                      <strong>Truy cập Sapo Admin:</strong> Đăng nhập vào trang quản trị cửa hàng Sapo của bạn. Trên menu bên trái, chọn <strong>Website</strong> → <strong>Giao diện</strong>.
                    </li>
                    <li>
                      <strong>Chỉnh sửa Code Giao Diện:</strong> Tại giao diện đang sử dụng, bấm nút <strong>Thao tác</strong> → Chọn <strong>Chỉnh sửa code</strong>.
                    </li>
                    <li>
                      <strong>Chèn đoạn mã Widget:</strong> Trong danh sách các tập tin bên trái, tìm và chọn file <code className="bg-slate-200 px-1 rounded text-rose-600 font-mono">theme.bte</code> (hoặc <code className="bg-slate-200 px-1 rounded text-rose-600 font-mono">layout.bte</code>, <code className="bg-slate-200 px-1 rounded text-rose-600 font-mono">header.bte</code>). Cuộn xuống cuối file và dán đoạn mã Script vào ngay <strong>TRƯỚC</strong> thẻ đóng <code className="text-indigo-600 font-mono font-bold">&lt;/body&gt;</code>.
                    </li>
                    <li>
                      <strong>Lưu & Kiểm tra:</strong> Bấm nút <strong>Lưu</strong> ở góc trên. Sau đó mở trang chủ Website Sapo để trải nghiệm Bong Bóng Chat AI hiển thị ngay góc dưới màn hình!
                    </li>
                  </ol>
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                    💡 <strong>Cách 2 (Qua Mã Nhúng JS Bổ Sung):</strong> Vào <strong>Cấu hình</strong> → <strong>Cấu hình chung</strong> → Tìm mục <strong>Mã nhúng JS bổ sung / Google Analytics</strong> → Dán mã Script vào và bấm Lưu.
                  </div>
                </div>
              )}

              {activePlatform === 'haravan' && (
                <div className="space-y-2.5">
                  <div className="font-bold text-indigo-950 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px]">1</span>
                    <span>Hướng dẫn tích hợp AI Chatbot vào Haravan Store:</span>
                  </div>
                  <ol className="list-decimal pl-5 space-y-2 text-slate-700 leading-relaxed">
                    <li>Sao chép mã Script ở khung phía trên.</li>
                    <li>Đăng nhập Haravan Admin → Chọn <strong>Website</strong> → <strong>Giao diện</strong>.</li>
                    <li>Bấm nút <strong>Thao tác</strong> → Chọn <strong>Chỉnh sửa code</strong>.</li>
                    <li>Mở file <code className="bg-slate-200 px-1 rounded text-rose-600 font-mono">theme.liquid</code> trong thư mục <em>Layout</em>.</li>
                    <li>Dán đoạn mã Script vào trước thẻ đóng <code className="text-indigo-600 font-mono font-bold">&lt;/body&gt;</code> và bấm <strong>Lưu</strong>.</li>
                  </ol>
                </div>
              )}

              {activePlatform === 'wordpress' && (
                <div className="space-y-2.5">
                  <div className="font-bold text-indigo-950 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px]">1</span>
                    <span>Hướng dẫn tích hợp AI Chatbot vào WordPress / WooCommerce:</span>
                  </div>
                  <ol className="list-decimal pl-5 space-y-2 text-slate-700 leading-relaxed">
                    <li>Sao chép mã Script ở khung phía trên.</li>
                    <li>Đăng nhập WordPress Admin → Chọn <strong>Plugins</strong> → <strong>Cài mới (Add New)</strong>.</li>
                    <li>Tìm kiếm và cài đặt Plugin <strong>WPCode (Insert Headers and Footers)</strong>.</li>
                    <li>Vào mục <strong>Code Snippets</strong> → <strong>Header & Footer</strong>.</li>
                    <li>Dán mã Script vào ô <strong>Footer</strong> và bấm <strong>Save Changes</strong>.</li>
                  </ol>
                </div>
              )}

              {activePlatform === 'ladipage' && (
                <div className="space-y-2.5">
                  <div className="font-bold text-indigo-950 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-[10px]">1</span>
                    <span>Hướng dẫn tích hợp AI Chatbot vào LadiPage:</span>
                  </div>
                  <ol className="list-decimal pl-5 space-y-2 text-slate-700 leading-relaxed">
                    <li>Sao chép mã Script ở khung phía trên.</li>
                    <li>Mở trang LadiPage muốn nhúng trong trình thiết kế.</li>
                    <li>Vào <strong>Thiết lập</strong> (biểu tượng bánh răng) → Chọn <strong>Mã Javascript/CSS</strong>.</li>
                    <li>Dán mã Script vào mục <strong>Mã Javascript Body</strong>.</li>
                    <li>Bấm <strong>Xuất bản lại</strong> trang Landing Page của bạn.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>

          {/* Widget Styling Customization */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
              <Palette className="w-4 h-4 text-blue-600" />
              <span>Tùy Chỉnh Giao Diện Floating Widget</span>
            </h3>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-2">Màu chủ đạo Widget</label>
                <div className="flex flex-wrap gap-3">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() => setWidgetSettings({ ...widgetSettings, primaryColor: preset.hex })}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                        widgetSettings.primaryColor === preset.hex
                          ? 'border-slate-900 ring-2 ring-slate-900/20 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ backgroundColor: preset.hex }}
                      ></span>
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vị trí nút bong bóng</label>
                  <select
                    value={widgetSettings.position}
                    onChange={(e) => setWidgetSettings({ ...widgetSettings, position: e.target.value as any })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="bottom-right">Góc dưới bên phải (Bottom Right)</option>
                    <option value="bottom-left">Góc dưới bên trái (Bottom Left)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nhãn trên nút Bong Bóng</label>
                  <input
                    type="text"
                    value={widgetSettings.buttonText}
                    onChange={(e) => setWidgetSettings({ ...widgetSettings, buttonText: e.target.value })}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Live Website Mock Simulator */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl relative min-h-[600px] flex flex-col justify-between overflow-hidden">
          
          {/* Mock Website Browser Window */}
          <div className="w-full">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              </div>
              <div className="flex-1 bg-slate-800 rounded-lg py-1 px-3 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>https://your-store.vn (Mô phỏng Website)</span>
                <Globe className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            <div className="mt-8 text-center text-slate-400 space-y-3">
              <div className="inline-flex p-3 rounded-2xl bg-slate-800 text-blue-400">
                <Sparkles className="w-8 h-8" />
              </div>
              <h4 className="text-white font-bold text-base">Xem Trước Widget Trên Website Thực</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Bấm vào bong bóng chat bên dưới để xem trải nghiệm cửa sổ trò chuyện nổi bật của khách hàng trên giao diện website của bạn!
              </p>
            </div>
          </div>

          {/* Interactive Floating Chat Popup in Simulator */}
          {isWidgetOpen && (
            <div
              className={`absolute bottom-20 z-30 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all animate-in fade-in slide-in-from-bottom-5 duration-200 ${
                widgetSettings.position === 'bottom-right' ? 'right-6' : 'left-6'
              }`}
              style={{ height: '480px' }}
            >
              {/* Popup Header */}
              <div
                className="p-4 text-white flex items-center justify-between shadow-xs"
                style={{ backgroundColor: widgetSettings.primaryColor }}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={agentConfig.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'}
                    alt={agentConfig.name}
                    className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/30"
                  />
                  <div>
                    <h4 className="font-bold text-xs">{agentConfig.name}</h4>
                    <p className="text-[10px] opacity-80">{widgetSettings.subtitle}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsWidgetOpen(false)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Popup Chat Body */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50 text-xs">
                {widgetMessages.map((msg) => {
                  const isAgent = msg.sender === 'agent';
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 max-w-[85%] ${
                        isAgent ? 'self-start' : 'ml-auto flex-row-reverse'
                      }`}
                    >
                      <div
                        className={`p-3 rounded-xl text-xs leading-relaxed shadow-2xs ${
                          isAgent
                            ? 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                            : 'text-white rounded-tr-xs'
                        }`}
                        style={{ backgroundColor: !isAgent ? widgetSettings.primaryColor : undefined }}
                      >
                        <FormattedMessage content={msg.text} isAgent={isAgent} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Popup Footer */}
              <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
                <input
                  type="text"
                  value={widgetInput}
                  onChange={(e) => setWidgetInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleWidgetSend()}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 p-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1"
                />
                <button
                  onClick={handleWidgetSend}
                  className="p-2 text-white rounded-xl shadow-xs"
                  style={{ backgroundColor: widgetSettings.primaryColor }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Floating Launcher Button */}
          <div
            className={`absolute bottom-6 ${
              widgetSettings.position === 'bottom-right' ? 'right-6' : 'left-6'
            }`}
          >
            <button
              onClick={() => setIsWidgetOpen(!isWidgetOpen)}
              className="flex items-center gap-2.5 px-4 py-3 rounded-full text-white font-semibold text-xs shadow-xl transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: widgetSettings.primaryColor }}
            >
              <Bot className="w-5 h-5" />
              <span>{widgetSettings.buttonText}</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
