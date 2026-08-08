import React, { useState } from 'react';
import { 
  Sliders, 
  UserCheck, 
  HelpCircle, 
  MessageSquare, 
  Building2, 
  Sparkles, 
  Check, 
  Save,
  Cpu,
  Key,
  Globe,
  Eye,
  EyeOff,
  Zap,
  Info
} from 'lucide-react';
import { AgentConfig, AIProvider, WidgetSettings } from '../types';

interface AgentPersonaConfigProps {
  agentConfig: AgentConfig;
  setAgentConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  setWidgetSettings?: React.Dispatch<React.SetStateAction<WidgetSettings>>;
}

export const AgentPersonaConfig: React.FC<AgentPersonaConfigProps> = ({
  agentConfig,
  setAgentConfig,
  setWidgetSettings,
}) => {
  const [formData, setFormData] = useState<AgentConfig>({
    selectedProvider: 'google',
    selectedModel: 'gemini-2.5-flash',
    customApiKey: '',
    customApiEndpoint: '',
    temperature: 0.7,
    ...agentConfig 
  });

  React.useEffect(() => {
    setFormData((prev) => ({
      selectedProvider: 'google',
      selectedModel: 'gemini-2.5-flash',
      customApiKey: '',
      customApiEndpoint: '',
      temperature: 0.7,
      ...agentConfig
    }));
  }, [agentConfig]);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSelectProvider = (newProvider: AIProvider) => {
    const provConfig = providersList.find((p) => p.id === newProvider) || providersList[0];
    const currentProv = formData.selectedProvider || 'google';

    const updatedKeys = {
      ...(formData.providerApiKeys || {}),
      [currentProv]: formData.customApiKey || '',
    };
    const updatedEndpoints = {
      ...(formData.providerEndpoints || {}),
      [currentProv]: formData.customApiEndpoint || '',
    };

    setFormData({
      ...formData,
      selectedProvider: newProvider,
      selectedModel: provConfig.defaultModel,
      customApiKey: updatedKeys[newProvider] || '',
      customApiEndpoint: updatedEndpoints[newProvider] || '',
      providerApiKeys: updatedKeys,
      providerEndpoints: updatedEndpoints,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentProv = formData.selectedProvider || 'google';
    const finalData = {
      ...formData,
      providerApiKeys: {
        ...(formData.providerApiKeys || {}),
        [currentProv]: formData.customApiKey || '',
      },
      providerEndpoints: {
        ...(formData.providerEndpoints || {}),
        [currentProv]: formData.customApiEndpoint || '',
      },
    };
    setAgentConfig(finalData);

    try {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentConfig: finalData }),
      }).catch(() => {});
    } catch (err) {
      console.warn('Failed to sync agentConfig to backend', err);
    }

    if (setWidgetSettings) {
      setWidgetSettings((prev) => ({
        ...prev,
        headerTitle: finalData.businessName ? `Hỗ Trợ Khách Hàng ${finalData.businessName}` : (finalData.name || prev.headerTitle),
        subtitle: finalData.title || prev.subtitle,
      }));
    }

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const providersList: {
    id: AIProvider;
    name: string;
    icon: string;
    description: string;
    badge: string;
    badgeColor: string;
    defaultModel: string;
    models: { id: string; name: string; tag: string; desc: string }[];
  }[] = [
    {
      id: 'google',
      name: 'Google Gemini',
      icon: '✨',
      description: 'Hệ sinh thái Gemini AI chính thức từ Google. Hỗ trợ đa phương tiện (Hình ảnh, Video, Tài liệu).',
      badge: 'Mặc định Server',
      badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
      defaultModel: 'gemini-3.6-flash',
      models: [
        { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', tag: 'Khuyên Dùng', desc: 'Tốc độ siêu nhanh, phản hồi tức thì, xử lý ảnh & tài liệu xuất sắc' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Phổ Biến', desc: 'Mô hình Gemini 2.5 Flash ổn định và nhanh chóng' },
        { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', tag: 'Mới Nhất', desc: 'Phiên bản Gemini Flash mới nhất, tự động nâng cấp' },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', tag: 'Tiết Kiệm Quota', desc: 'Mô hình siêu nhẹ, tiết kiệm quota lượt gọi miễn phí' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', tag: 'Chuyên Sâu', desc: 'Khả năng suy luận tư duy đỉnh cao, giải quyết nghiệp vụ phức tạp' },
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI (ChatGPT)',
      icon: '🤖',
      description: 'Dòng mô hình GPT nổi tiếng thế giới. Cần có API Key cá nhân của OpenAI.',
      badge: 'Yêu cầu API Key',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      defaultModel: 'gpt-4o',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o (Omni)', tag: 'Hàng Đầu', desc: 'Mô hình đa phương tiện thông minh nhất của OpenAI' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tag: 'Tiết Kiệm', desc: 'Phản hồi nhanh, chi phí tối ưu cho chat tư vấn' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', tag: 'Tư Duy', desc: 'Xử lý văn bản ngữ cảnh dài và chỉ dẫn chi tiết' },
      ],
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      icon: '🧠',
      description: 'Mô hình Claude nổi tiếng với khả năng lập luận sắc bén và văn phong giao tiếp tự nhiên.',
      badge: 'Yêu cầu API Key',
      badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
      defaultModel: 'claude-3-5-sonnet-20241022',
      models: [
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', tag: 'Văn Phong Chuẩn', desc: 'Khả năng giao tiếp tinh tế, phân tích dữ liệu chuyên nghiệp' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', tag: 'Siêu Nhanh', desc: 'Mô hình gọn nhẹ, phản hồi tức thì cho hỗ trợ khách hàng' },
      ],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek AI',
      icon: '⚡',
      description: 'Mô hình AI thế hệ mới với khả năng hiểu tiếng Việt cực sâu & chi phí cực rẻ.',
      badge: 'Giá Cực Rẻ',
      badgeColor: 'bg-amber-100 text-amber-700 border-amber-200',
      defaultModel: 'deepseek-chat',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', tag: 'Phổ Biến', desc: 'Thông minh, giao tiếp mượt mà, hiểu ngữ cảnh Việt Nam' },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', tag: 'Suy Luận', desc: 'Mô hình suy luận tư duy từng bước (Chain-of-Thought)' },
      ],
    },
    {
      id: 'custom_openai',
      name: 'Custom / Local LLM',
      icon: '🔌',
      description: 'Kết nối API tương thích OpenAI hoặc Local LLM (Ollama, LM Studio, LocalAI, Enterprise Proxy).',
      badge: 'Tự Do Tùy Chỉnh',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
      defaultModel: 'llama3.2',
      models: [
        { id: 'llama3.2', name: 'Llama 3.2 (Meta)', tag: 'Local / Cloud', desc: 'Mô hình mã nguồn mở thế hệ mới' },
        { id: 'mistral-small', name: 'Mistral Small', tag: 'Nhanh Nhẹ', desc: 'Phản hồi nhanh, chuẩn mực' },
        { id: 'qwen2.5', name: 'Qwen 2.5 (Alibaba)', tag: 'Đa Ngôn Ngữ', desc: 'Khả năng tiếng Việt và Châu Á rất tốt' },
      ],
    },
  ];

  const currentProviderConfig = providersList.find(p => p.id === (formData.selectedProvider || 'google')) || providersList[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
            <Sliders className="w-3.5 h-3.5" />
            <span>Cấu Hình Nhân Cách & Động Cơ AI</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Thiết Lập Động Cơ AI & Giọng Điệu Agent</h2>
          <p className="text-xs text-slate-500 mt-1">
            Lựa chọn nhà cung cấp AI (Google, OpenAI, Claude, DeepSeek...), tùy chỉnh mô hình làm việc và cài đặt xưng hô giao tiếp tự nhiên.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold animate-pulse">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Đã lưu cấu hình!</span>
          </div>
        )}
      </div>

      {/* Data Priority Policy Explanation Card */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Cơ Chế Bắt Buộc & Tự Động Chuyển Đổi Phong Cách</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
            Tự động theo AI
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Priority 1 & 2 */}
          <div className="bg-slate-800/80 p-4 rounded-xl border border-indigo-500/30 space-y-2">
            <div className="font-bold text-indigo-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              1. Ưu Tiên Dữ Liệu Tra Cứu
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Agent bắt buộc phải kiểm tra thông tin trong <b>Website đã cào</b>, <b>Tài liệu nạp</b> và <b>Danh mục Sản phẩm</b> trước. Nếu không đủ, tự động dùng <b>Tri thức AI tích hợp</b>.
            </p>
          </div>

          {/* Dynamic Persona Switching */}
          <div className="bg-slate-800/80 p-4 rounded-xl border border-emerald-500/30 space-y-2">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              2. Chuyển Đổi Phong Cách Theo Ngữ Cảnh
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              • <b>Hỏi Mua / Giá / Đặt Hàng</b> ➔ Phản hồi như <b>Nhân viên Bán hàng Chuyên nghiệp</b> (ân cần, ưu đãi, báo giá rõ ràng).<br />
              • <b>Hỏi Sử Dụng / Kỹ Thuật / Chọn Loại</b> ➔ Phản hồi như <b>Chuyên gia Thực thụ</b> (phân tích sâu, chuẩn xác step-by-step).
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* SECTION 0: Multi-Provider & Model Selection */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>Cài Đặt Động Cơ AI (AI Model & Provider Selection)</span>
            </h3>
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              Hiện tại: <strong className="text-indigo-600 font-bold">{currentProviderConfig.name}</strong> ({formData.selectedModel || currentProviderConfig.defaultModel})
            </span>
          </div>

          {/* Provider Tabs/Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              1. Chọn Nhà Cung Cấp Trí Tuệ Nhân Tạo (AI Provider)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {providersList.map((provider) => {
                const isSelected = (formData.selectedProvider || 'google') === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleSelectProvider(provider.id)}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-lg">{provider.icon}</span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                        )}
                      </div>
                      <div className={`text-xs font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                        {provider.name}
                      </div>
                    </div>
                    <div className="mt-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${provider.badgeColor}`}>
                        {provider.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-indigo-500" />
              <span>{currentProviderConfig.description}</span>
            </p>
          </div>

          {/* Model Selector for current provider */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              2. Chọn Mô Hình Cụ Thể (Model)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {currentProviderConfig.models.map((m) => {
                const isModelSelected = (formData.selectedModel || currentProviderConfig.defaultModel) === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, selectedModel: m.id })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isModelSelected
                        ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-900">{m.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-semibold border border-indigo-100">
                        {m.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal">{m.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* Custom Model ID input if Custom provider chosen */}
            {formData.selectedProvider === 'custom_openai' && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Model ID tùy chỉnh</label>
                <input
                  type="text"
                  value={formData.selectedModel || ''}
                  onChange={(e) => setFormData({ ...formData, selectedModel: e.target.value })}
                  placeholder="Ví dụ: llama3.2, mistral-7b, qwen2.5-coder"
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>
            )}
          </div>

          {/* API Key & Custom Endpoint Input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
            <div>
              <label className="font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-slate-500" />
                  API Key Cá Nhân {formData.selectedProvider === 'google' ? '(Tùy chọn)' : '(Bắt buộc)'}
                </span>
                {formData.selectedProvider === 'google' && (
                  <span className="text-[10px] text-emerald-600 font-semibold">Đã có Key hệ thống</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={formData.customApiKey || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const currentProv = formData.selectedProvider || 'google';
                    setFormData({
                      ...formData,
                      customApiKey: val,
                      providerApiKeys: {
                        ...(formData.providerApiKeys || {}),
                        [currentProv]: val,
                      },
                    });
                  }}
                  placeholder={
                    formData.selectedProvider === 'google' 
                      ? 'Để trống để dùng Key mặc định của Server' 
                      : `Nhập API Key cho ${currentProviderConfig.name}...`
                  }
                  className="w-full p-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-between flex-wrap gap-1">
                <span>API Key được tự động lưu cho từng nhà cung cấp trên trình duyệt của bạn.</span>
                {formData.selectedProvider === 'google' && (
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Lấy Gemini Key Miễn Phí (Google AI Studio) ↗</span>
                  </a>
                )}
                {formData.selectedProvider === 'openai' && (
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Lấy API Key trên OpenAI Platform ↗</span>
                  </a>
                )}
                {formData.selectedProvider === 'deepseek' && (
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Lấy API Key trên DeepSeek Platform ↗</span>
                  </a>
                )}
                {formData.selectedProvider === 'anthropic' && (
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    <span>Lấy API Key trên Anthropic Console ↗</span>
                  </a>
                )}
              </p>
            </div>

            <div>
              <label className="font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                Custom Endpoint / Base URL {formData.selectedProvider === 'custom_openai' ? '(Bắt buộc)' : '(Tùy chọn)'}
              </label>
              <input
                type="text"
                value={formData.customApiEndpoint || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const currentProv = formData.selectedProvider || 'google';
                  setFormData({
                    ...formData,
                    customApiEndpoint: val,
                    providerEndpoints: {
                      ...(formData.providerEndpoints || {}),
                      [currentProv]: val,
                    },
                  });
                }}
                placeholder={
                  formData.selectedProvider === 'custom_openai'
                    ? 'https://my-local-llm.ngrok-free.app/v1 hoặc http://localhost:11434/v1'
                    : 'Để trống để sử dụng Endpoint mặc định của nhà cung cấp'
                }
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono text-[11px]"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Dùng khi kết nối với Proxy Server, Ollama, LM Studio hoặc Enterprise Gateway.
              </p>
            </div>
          </div>

          {/* Temperature Slider */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <label className="font-semibold text-slate-700 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Độ Sáng Tạo Phản Hồi (Temperature): <strong className="text-indigo-600">{formData.temperature ?? 0.7}</strong>
              </label>
              <span className="text-[11px] text-slate-500">
                {(formData.temperature ?? 0.7) <= 0.3 ? 'Rất Chuẩn Xác / Lập Luận' : (formData.temperature ?? 0.7) <= 0.7 ? 'Cân Bằng Tư Vấn' : 'Tự Nhiên & Sáng Tạo'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={formData.temperature ?? 0.7}
              onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>0.0 (Chuẩn xác tuyệt đối, tra cứu chính xác)</span>
              <span>0.5 (Cân bằng)</span>
              <span>1.0 (Phóng khoáng, tự nhiên)</span>
            </div>
          </div>
        </div>

        {/* Section 1: Business Identity & Agent Persona */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
            <UserCheck className="w-4 h-4 text-indigo-600" />
            <span>Thông Tin Đại Diện Agent</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tên hiển thị Agent</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Trợ Lý Agent AI"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Chức danh / Vai trò</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Chuyên viên Tư Vấn & Hỗ Trợ Khách Hàng"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tên Doanh Nghiệp / Thương hiệu</label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ngành nghề kinh doanh</label>
              <input
                type="text"
                value={formData.businessIndustry}
                onChange={(e) => setFormData({ ...formData, businessIndustry: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Mô tả tóm tắt doanh nghiệp</label>
              <input
                type="text"
                value={formData.businessDescription}
                onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">URL Ảnh đại diện (Avatar)</label>
              <input
                type="text"
                value={formData.avatarUrl || ''}
                onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Communication Tone & Greeting */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            <span>Phong Cách Giao Tiếp & Lời Chào</span>
          </h3>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-2">Giọng điệu trả lời (Tone of Voice)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'friendly', label: 'Thân Thiện & Ấm Áp', desc: 'Xưng em/anh chị, tự nhiên như con người' },
                  { id: 'professional', label: 'Chuyên Nghiệp', desc: 'Rõ ràng, chuẩn mực, lịch sự' },
                  { id: 'formal', label: 'Trang Trọng', desc: 'Tự xưng Chúng tôi, nghi thức công ty' },
                  { id: 'enthusiastic', label: 'Nhiệt Tình', desc: 'Nhiều năng lượng, hỗ trợ hết mình' },
                ].map((tone) => (
                  <button
                    key={tone.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, tone: tone.id as any })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formData.tone === tone.id
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-900 font-semibold'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="font-bold mb-1">{tone.label}</div>
                    <div className="text-[10px] text-slate-500">{tone.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tin nhắn chào mừng ban đầu</label>
              <textarea
                value={formData.greetingMessage}
                onChange={(e) => setFormData({ ...formData, greetingMessage: e.target.value })}
                rows={3}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 3: Clarification Logic (Ask Follow-up Questions) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-600" />
              <span>Cơ Chế Hỏi Lại Để Làm Rõ Thông Tin (Clarification Rules)</span>
            </h3>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.clarificationEnabled}
                onChange={(e) => setFormData({ ...formData, clarificationEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Khi bật tính năng này: Nếu khách hàng hỏi một câu hỏi quá mơ hồ (ví dụ: "Sản phẩm nào tốt?", "Màn hình bị hỏng sửa sao?"), Agent sẽ <b>chủ động đặt 1-2 câu hỏi mở lịch sự</b> để xác định đúng loại máy, nhu cầu hoặc triệu chứng trước khi đưa ra tư vấn.
          </p>

          {formData.clarificationEnabled && (
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs space-y-2">
              <span className="font-bold text-emerald-900 block">Ví dụ cách Agent sẽ phản hồi khi thiếu thông tin:</span>
              <ul className="list-disc list-inside text-emerald-800 space-y-1">
                <li>Khách hỏi: <i>"Tôi muốn mua robot hút bụi"</i> ➔ Agent hỏi lại: <i>"Dạ em chào anh/chị! Để em tư vấn dòng máy phù hợp nhất, cho em hỏi diện tích nhà mình khoảng bao nhiêu m2 và nhà có nuôi thú cưng không ạ?"</i></li>
                <li>Khách gửi ảnh bị lỗi ➔ Agent xem ảnh & hỏi thêm: <i>"Em đã xem hình ảnh anh/chị gửi. Anh/chị cho em hỏi thiết bị đã cắm sạc thử ổ điện khác chưa ạ?"</i></li>
              </ul>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-md cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Lưu Thay Đổi Cấu Hình</span>
          </button>
        </div>

      </form>

    </div>
  );
};
