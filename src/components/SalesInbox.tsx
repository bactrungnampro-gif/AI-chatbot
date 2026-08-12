import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  User,
  Bot,
  Clock,
  ChevronLeft,
  Inbox,
  CheckCircle2,
  PhoneCall,
  Trophy,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

// [Bước 3] Màn quản trị "Hộp thư bán hàng": xem Lead (khách để lại SĐT) + Hội thoại thật của khách.
// Dữ liệu lấy từ các endpoint /api/admin/* (được middleware auth bảo vệ khi AUTH_ENABLED).
// Token Bearer được tự động gắn bởi interceptor trong src/lib/auth.ts nên chỉ cần fetch bình thường.

interface Lead {
  id: number | string;
  session_id?: string | null;
  name?: string | null;
  phone?: string | null;
  note?: string | null;
  source?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface ConversationSummary {
  session_id: string;
  messages: number;
  lastAt?: string | null;
  lastText?: string | null;
}

interface ChatLogRow {
  id: number | string;
  session_id: string;
  sender: string;
  text?: string | null;
  created_at?: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ComponentType<any> }> = {
  new: { label: 'Mới', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: Inbox },
  called: { label: 'Đã gọi', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: PhoneCall },
  won: { label: 'Chốt đơn', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Trophy },
  lost: { label: 'Không thành', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: XCircle },
};

const STATUS_ORDER = ['new', 'called', 'won', 'lost'];

function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso);
  }
}

export const SalesInbox: React.FC = () => {
  const [view, setView] = useState<'leads' | 'conversations'>('leads');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Sub-tab switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('leads')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            view === 'leads'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" /> Khách tiềm năng (Lead)
        </button>
        <button
          onClick={() => setView('conversations')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            view === 'conversations'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Hội thoại khách hàng
        </button>
      </div>

      {view === 'leads' ? <LeadsPanel /> : <ConversationsPanel />}
    </div>
  );
};

// ------------------------------------------------------------------
//  PANEL 1 — DANH SÁCH LEAD
// ------------------------------------------------------------------
const LeadsPanel: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | number | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/leads?limit=500');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Lỗi ${res.status}`);
      }
      const data = await res.json();
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (e: any) {
      setError(e?.message || 'Không tải được danh sách lead.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string | number, status: string) => {
    setSavingId(id);
    // Cập nhật lạc quan (optimistic) để UI mượt.
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      const res = await fetch('/api/admin/lead-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Lỗi ${res.status}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Không cập nhật được trạng thái.');
      load(); // đồng bộ lại nếu lỗi
    } finally {
      setSavingId(null);
    }
  };

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = leads.filter((l) => (l.status || 'new') === s).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = leads.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(l.phone || '').toLowerCase().includes(q) ||
      String(l.name || '').toLowerCase().includes(q) ||
      String(l.note || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="text-2xl font-black text-slate-900">{leads.length}</div>
          <div className="text-xs text-slate-500 font-medium">Tổng số Lead</div>
        </div>
        {STATUS_ORDER.map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <div key={s} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-slate-400" />
                <div className="text-2xl font-black text-slate-900">{counts[s] || 0}</div>
              </div>
              <div className="text-xs text-slate-500 font-medium">{meta.label}</div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" /> Khách hàng tiềm năng
            </h3>
            <p className="text-xs text-slate-500">SĐT khách để lại (tự động phát hiện trong chat hoặc qua form)</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm SĐT / tên / ghi chú..."
                className="pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs w-full bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
              title="Tải lại"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
            </button>
          </div>
        </div>

        {error && (
          <div className="m-4 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {/* List */}
        <div className="p-4">
          {loading ? (
            <div className="text-center text-sm text-slate-400 py-10">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">
              <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              {leads.length === 0 ? 'Chưa có lead nào. Khi khách để lại SĐT trong chat, lead sẽ hiện ở đây.' : 'Không có kết quả phù hợp.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((l) => {
                const status = l.status || 'new';
                const meta = STATUS_META[status] || STATUS_META.new;
                return (
                  <div
                    key={l.id}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`tel:${l.phone || ''}`} className="font-bold text-slate-900 text-sm hover:text-indigo-600">
                          {l.phone || '(không có SĐT)'}
                        </a>
                        {l.name && <span className="text-xs text-slate-500">• {l.name}</span>}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.cls}`}>
                          {meta.label}
                        </span>
                        {l.source === 'handoff' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                            🙋 Cần gặp NV
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {l.source === 'form' ? 'Từ form' : l.source === 'handoff' ? 'Yêu cầu gặp nhân viên' : 'Tự bắt trong chat'}
                        </span>
                      </div>
                      {l.note && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{l.note}</p>}
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {fmtTime(l.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {STATUS_ORDER.map((s) => {
                        const active = status === s;
                        const m = STATUS_META[s];
                        return (
                          <button
                            key={s}
                            disabled={savingId === l.id}
                            onClick={() => updateStatus(l.id, s)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                              active ? m.cls : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'
                            }`}
                            title={`Đánh dấu: ${m.label}`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
//  PANEL 2 — HỘI THOẠI
// ------------------------------------------------------------------
const ConversationsPanel: React.FC = () => {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatLogRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/conversations');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Lỗi ${res.status}`);
      }
      const data = await res.json();
      setList(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (e: any) {
      setError(e?.message || 'Không tải được danh sách hội thoại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openThread = async (session: string) => {
    setOpenSession(session);
    setThreadLoading(true);
    setThread([]);
    try {
      const res = await fetch(`/api/admin/conversation?session=${encodeURIComponent(session)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Lỗi ${res.status}`);
      }
      const data = await res.json();
      setThread(Array.isArray(data.messages) ? data.messages : []);
    } catch (e: any) {
      setError(e?.message || 'Không tải được nội dung hội thoại.');
    } finally {
      setThreadLoading(false);
    }
  };

  // Chi tiết 1 phiên hội thoại
  if (openSession) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100">
          <button
            onClick={() => { setOpenSession(null); setThread([]); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
          >
            <ChevronLeft className="w-4 h-4" /> Quay lại
          </button>
          <div className="text-xs text-slate-400 truncate">Phiên: {openSession}</div>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {threadLoading ? (
            <div className="text-center text-sm text-slate-400 py-10">Đang tải...</div>
          ) : thread.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">Không có tin nhắn.</div>
          ) : (
            thread.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div key={m.id} className={`flex items-start gap-3 ${isUser ? '' : 'flex-row-reverse'}`}>
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white ${
                      isUser ? 'bg-slate-700' : 'bg-indigo-600'
                    }`}
                  >
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`max-w-[75%] ${isUser ? 'text-left' : 'text-right'}`}>
                    <div
                      className={`inline-block px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                        isUser ? 'bg-slate-100 text-slate-800 rounded-tl-sm' : 'bg-indigo-50 text-slate-800 rounded-tr-sm'
                      }`}
                    >
                      {m.text}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">{fmtTime(m.created_at)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Danh sách phiên
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-600" /> Hội thoại khách hàng
          </h3>
          <p className="text-xs text-slate-500">Các phiên chat thật của khách trên website (gom theo phiên)</p>
        </div>
        <button
          onClick={loadList}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
        </button>
      </div>

      {error && (
        <div className="m-4 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="p-4">
        {loading ? (
          <div className="text-center text-sm text-slate-400 py-10">Đang tải...</div>
        ) : list.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-10">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Chưa có hội thoại nào được ghi lại.
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((c) => (
              <button
                key={c.session_id}
                onClick={() => openThread(c.session_id)}
                className="w-full text-left p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-indigo-50/40 hover:border-indigo-100 transition-colors flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm truncate">{c.session_id}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{c.messages} tin</span>
                  </div>
                  {c.lastText && <p className="text-xs text-slate-500 truncate mt-0.5">{c.lastText}</p>}
                </div>
                <div className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {fmtTime(c.lastAt)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
