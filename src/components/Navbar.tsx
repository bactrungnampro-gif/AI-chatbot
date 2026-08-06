import React from 'react';
import { 
  Bot, 
  MessageSquare, 
  BookOpen, 
  ShoppingBag, 
  Sliders, 
  Code2, 
  History,
  Sparkles,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  hasApiKey: boolean;
  onOpenWidgetPreview: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  hasApiKey,
  onOpenWidgetPreview,
}) => {
  const tabs = [
    { id: 'chat', label: 'Thử Nghiệm Chat (Sandbox)', icon: MessageSquare },
    { id: 'knowledge', label: 'Cơ Sở Tri Thức & Web Data', icon: BookOpen },
    { id: 'products', label: 'Danh Mục Sản Phẩm', icon: ShoppingBag },
    { id: 'persona', label: 'Cấu Hình Agent & Qui Tắc', icon: Sliders },
    { id: 'integration', label: 'Tích Hợp Website Widget', icon: Code2 },
    { id: 'history', label: 'Lịch Sử & Nhật Ký', icon: History },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Agent Status */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Trợ Lý AI <span className="text-xs font-medium text-slate-400 hidden sm:inline-block">| Hệ Thống Tự Động 24/7</span>
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  Hoạt động trên Website
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Ưu tiên dữ liệu Website & Tài liệu nạp • Tự động bổ sung trí tuệ nhân tạo khi thiếu
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              hasApiKey 
                ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>{hasApiKey ? 'Động cơ AI: Sẵn sàng' : 'Chế độ Trải nghiệm'}</span>
            </div>

            <button
              onClick={onOpenWidgetPreview}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>Xem Floating Widget</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </button>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 overflow-x-auto no-scrollbar border-t border-slate-100 pt-1 pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600 font-bold border border-indigo-100 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};
