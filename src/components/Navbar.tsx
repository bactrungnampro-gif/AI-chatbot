import React from 'react';
import {
  Bot,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  FileText
} from 'lucide-react';

interface NavbarProps {
  hasApiKey: boolean;
  onOpenWidgetPreview: () => void;
}

// Thanh trên cùng: thương hiệu + trạng thái + nút nhanh.
// Danh sách màn hình đã chuyển sang MENU DỌC bên trái (Sidebar.tsx).
export const Navbar: React.FC<NavbarProps> = ({
  hasApiKey,
  onOpenWidgetPreview,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs">
      <div className="w-full px-3 sm:px-4 lg:px-6">
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
            <a
              href="/api/export-docx"
              download="Tong_Hop_Yeu_Cau_Va_He_Thong_AI.docx"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors border border-slate-200 shadow-2xs"
              title="Tải file Word (.docx) tổng hợp yêu cầu"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">Tải File Word (.docx)</span>
            </a>

            <div className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
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

        {/* [Nâng cấp UX] Hàng tab ngang đã chuyển sang MENU DỌC (Sidebar.tsx) -> không còn phải kéo trượt. */}

      </div>
    </header>
  );
};
