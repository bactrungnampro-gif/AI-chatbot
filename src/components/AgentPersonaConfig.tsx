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
  Languages
} from 'lucide-react';
import { AgentConfig } from '../types';

interface AgentPersonaConfigProps {
  agentConfig: AgentConfig;
  setAgentConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export const AgentPersonaConfig: React.FC<AgentPersonaConfigProps> = ({
  agentConfig,
  setAgentConfig,
}) => {
  const [formData, setFormData] = useState<AgentConfig>({ ...agentConfig });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAgentConfig(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
            <Sliders className="w-3.5 h-3.5" />
            <span>Cấu Hình Nhân Cách & Quy Tắc AI</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Thiết Lập Agent & Tự Động Hỏi Lại</h2>
          <p className="text-xs text-slate-500 mt-1">
            Điều chỉnh xưng hô, giọng điệu giao tiếp tự nhiên như người thật và kích hoạt chế độ chủ động đặt câu hỏi gợi mở khi khách hàng cung cấp thiếu thông tin.
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
              Agent bắt buộc phải kiểm tra thông tin trong <b>Website đã cào</b>, <b>Tài liệu nạp</b> và <b>Danh mục Sản phẩm</b> trước. Nếu không đủ, tự động dùng <b>Tri thức Gemini AI tích hợp</b>.
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
                placeholder="Trợ Lý Linh (TechLife)"
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
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-md"
          >
            <Save className="w-4 h-4" />
            <span>Lưu Thay Đổi Cấu Hình</span>
          </button>
        </div>

      </form>

    </div>
  );
};
