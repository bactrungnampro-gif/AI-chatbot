import React from 'react';
import {
  MessageSquare,
  BookOpen,
  ShoppingBag,
  Sliders,
  Code2,
  History,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

// [Nâng cấp UX] Menu DỌC thay cho hàng tab ngang (7 tab bị tràn, phải kéo trượt mới thấy hết).
// Có nút thu gọn còn biểu tượng để lấy thêm không gian khi cần.
export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {
  // Nhóm theo công việc để dễ tìm: Vận hành / Dữ liệu / Cấu hình.
  const groups: { label: string; items: { id: string; label: string; short: string; icon: React.ComponentType<any> }[] }[] = [
    {
      label: 'Vận hành',
      items: [
        { id: 'inbox', label: 'Lead & Hội Thoại Khách', short: 'Lead & Hội thoại', icon: Inbox },
        { id: 'chat', label: 'Thử Nghiệm Chat (Sandbox)', short: 'Thử nghiệm chat', icon: MessageSquare },
      ],
    },
    {
      label: 'Dữ liệu',
      items: [
        { id: 'knowledge', label: 'Cơ Sở Tri Thức & Web Data', short: 'Cơ sở tri thức', icon: BookOpen },
        { id: 'products', label: 'Danh Mục Sản Phẩm', short: 'Sản phẩm', icon: ShoppingBag },
      ],
    },
    {
      label: 'Cấu hình',
      items: [
        { id: 'persona', label: 'Cấu Hình Agent & Qui Tắc', short: 'Cấu hình Agent', icon: Sliders },
        { id: 'integration', label: 'Tích Hợp Website Widget', short: 'Tích hợp Widget', icon: Code2 },
        { id: 'history', label: 'Lịch Sử & Nhật Ký', short: 'Lịch sử', icon: History },
      ],
    },
  ];

  return (
    <aside
      className={`shrink-0 bg-white border-r border-slate-200 sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto transition-all duration-200 ${
        collapsed ? 'w-[60px]' : 'w-[13rem] sm:w-[15rem]'
      }`}
    >
      <nav className="p-2 space-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            {!collapsed && (
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {g.label}
              </div>
            )}
            <div className="space-y-0.5">
              {g.items.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    className={`w-full flex items-center gap-2.5 rounded-xl text-xs font-medium transition-all ${
                      collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'
                    } ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    {!collapsed && <span className="truncate text-left">{tab.short}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Nút thu gọn / mở rộng menu */}
      <div className="p-2 border-t border-slate-100 mt-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /> Thu gọn</>}
        </button>
      </div>
    </aside>
  );
};
