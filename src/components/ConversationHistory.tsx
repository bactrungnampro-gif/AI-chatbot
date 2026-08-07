import React, { useState } from 'react';
import { 
  History, 
  Search, 
  MessageSquare, 
  CheckCircle2, 
  HelpCircle, 
  Clock, 
  User, 
  Bot,
  Filter
} from 'lucide-react';
import { ChatMessage } from '../types';

interface ConversationHistoryProps {
  messages: ChatMessage[];
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({ messages }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = messages.filter((m) =>
    (m.text || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalUserMessages = messages.filter((m) => m.sender === 'user').length;
  const totalClarifications = messages.filter((m) => m.clarificationAsked).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Stats Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{messages.length}</div>
            <div className="text-xs text-slate-500 font-medium">Tổng số tin nhắn trao đổi</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{totalUserMessages}</div>
            <div className="text-xs text-slate-500 font-medium">Câu hỏi từ khách hàng</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{totalClarifications}</div>
            <div className="text-xs text-slate-500 font-medium">Lần hỏi lại làm rõ nhu cầu</div>
          </div>
        </div>
      </div>

      {/* Log Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Nhật Ký Tương Tác Chi Tiết</h3>
            <p className="text-xs text-slate-500">Xem lại các tin nhắn và phân tích phản hồi của Agent AI</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tin nhắn..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full bg-slate-50"
            />
          </div>
        </div>

        {/* Messages List */}
        <div className="space-y-3">
          {filtered.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-start gap-3 text-xs"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-bold ${
                    isUser ? 'bg-slate-800' : 'bg-indigo-600'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {isUser ? 'Khách hàng' : 'Trợ lý AI Agent'}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {msg.timestamp}
                    </span>
                  </div>

                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.text || ''}</p>

                  {msg.clarificationAsked && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium mt-1">
                      <HelpCircle className="w-3 h-3 text-amber-600" />
                      Đã tự động đặt câu hỏi gợi mở làm rõ nhu cầu
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
