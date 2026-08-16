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
  HelpCircle,
  CheckCheck,
  Lightbulb,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  Headset,
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
  const [view, setView] = useState<'dashboard' | 'leads' | 'conversations' | 'gaps'>('dashboard');

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
      active ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Sub-tab switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setView('dashboard')} className={tabCls(view === 'dashboard')}>
          <BarChart3 className="w-4 h-4" /> Tổng quan
        </button>
        <button onClick={() => setView('leads')} className={tabCls(view === 'leads')}>
          <Users className="w-4 h-4" /> Khách tiềm năng (Lead)
        </button>
        <button onClick={() => setView('conversations')} className={tabCls(view === 'conversations')}>
          <MessageSquare className="w-4 h-4" /> Hội thoại khách hàng
        </button>
        <button onClick={() => setView('gaps')} className={tabCls(view === 'gaps')}>
          <HelpCircle className="w-4 h-4" /> Câu hỏi chưa trả lời được
        </button>
      </div>

      {view === 'dashboard' && <DashboardPanel />}
      {view === 'leads' && <LeadsPanel />}
      {view === 'conversations' && <ConversationsPanel />}
      {view === 'gaps' && <GapsPanel />}
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

// ------------------------------------------------------------------
//  PANEL 3 — CÂU HỎI AGENT CHƯA TRẢ LỜI ĐƯỢC (Answer Gaps)
// ------------------------------------------------------------------
interface GapItem {
  question: string;
  count: number;
  lastAt?: string | null;
  lastAnswer?: string | null;
  status?: string | null;
  ids: (number | string)[];
}

const GapsPanel: React.FC = () => {
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [expanded, setExpanded] = useState<string>('');

  const load = useCallback(async (all: boolean) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/gaps${all ? '?all=1' : ''}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Lỗi ${res.status}`);
      }
      const data = await res.json();
      setGaps(Array.isArray(data.gaps) ? data.gaps : []);
    } catch (e: any) {
      setError(e?.message || 'Không tải được danh sách.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(showAll);
  }, [load, showAll]);

  const markResolved = async (g: GapItem) => {
    setSavingKey(g.question);
    try {
      const res = await fetch('/api/admin/gap-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: g.ids, status: 'resolved' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Lỗi ${res.status}`);
      }
      // Bỏ khỏi danh sách hiện tại (nếu đang xem 'mới').
      if (!showAll) setGaps((prev) => prev.filter((x) => x.question !== g.question));
      else load(true);
    } catch (e: any) {
      setError(e?.message || 'Không cập nhật được.');
    } finally {
      setSavingKey('');
    }
  };

  const totalOccur = gaps.reduce((s, g) => s + (g.count || 0), 0);

  return (
    <div className="space-y-5">
      {/* Gợi ý sử dụng */}
      <div className="flex items-start gap-2 text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
        <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
        <span>
          Đây là những câu khách hỏi mà agent trả lời kiểu "chưa có thông tin". Hãy bổ sung câu trả lời cho chúng vào
          <b> Cơ Sở Tri Thức / Ngân hàng FAQ</b>, sau đó bấm <b>"Đã xử lý"</b> để ẩn khỏi danh sách. Agent sẽ trả lời tốt dần lên theo thời gian.
        </span>
      </div>

      {/* Stats + toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-600" /> Câu hỏi agent chưa trả lời được
            </h3>
            <p className="text-xs text-slate-500">
              {gaps.length} câu hỏi{showAll ? '' : ' còn tồn'} • {totalOccur} lượt khách hỏi
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded" />
              Hiện cả câu đã xử lý
            </label>
            <button
              onClick={() => load(showAll)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
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

        <div className="p-4">
          {loading ? (
            <div className="text-center text-sm text-slate-400 py-10">Đang tải...</div>
          ) : gaps.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">
              <CheckCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              Tuyệt vời! Không có câu hỏi nào agent bị "bí" {showAll ? '' : '(còn tồn)'}.
            </div>
          ) : (
            <div className="space-y-2">
              {gaps.map((g) => {
                const isOpen = expanded === g.question;
                return (
                  <div key={g.question} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                        <HelpCircle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 text-sm">{g.question}</span>
                          {g.count > 1 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              hỏi {g.count} lần
                            </span>
                          )}
                          {g.status === 'resolved' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              đã xử lý
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtTime(g.lastAt)}</span>
                          {g.lastAnswer && (
                            <button onClick={() => setExpanded(isOpen ? '' : g.question)} className="text-indigo-500 hover:underline">
                              {isOpen ? 'Ẩn câu trả lời' : 'Xem agent đã trả lời gì'}
                            </button>
                          )}
                        </div>
                        {isOpen && g.lastAnswer && (
                          <p className="text-xs text-slate-600 mt-2 bg-white border border-slate-100 rounded-lg p-2 whitespace-pre-wrap">{g.lastAnswer}</p>
                        )}
                      </div>
                      {g.status !== 'resolved' && (
                        <button
                          disabled={savingKey === g.question}
                          onClick={() => markResolved(g)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 shrink-0"
                          title="Đánh dấu đã bổ sung FAQ"
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> Đã xử lý
                        </button>
                      )}
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
//  PANEL 4 — TỔNG QUAN (Dashboard thống kê)
// ------------------------------------------------------------------
interface StatsData {
  enabled?: boolean;
  days?: number;
  totals?: {
    sessions: number; messages: number; leads: number; handoffs: number;
    conversionRate: number; feedbackUp: number; feedbackDown: number; gapsOpen: number;
  };
  daily?: { date: string; sessions: number; messages: number; leads: number }[];
  byHour?: number[];
  leadsByStatus?: Record<string, number>;
}

const DashboardPanel: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/stats?days=${d}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Lỗi ${res.status}`);
      }
      setStats(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Không tải được số liệu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const t = stats?.totals;
  const daily = stats?.daily || [];
  const byHour = stats?.byHour || [];
  const maxDaily = Math.max(1, ...daily.map((x) => x.sessions));
  const maxHour = Math.max(1, ...byHour);
  const peakHour = byHour.length ? byHour.indexOf(maxHour) : -1;

  // Thẻ số liệu dùng chung.
  const Stat = ({ icon: Icon, label, value, tone, hint }: any) => (
    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${tone || 'text-slate-400'}`} />
        <div className="text-2xl font-black text-slate-900">{value}</div>
      </div>
      <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Bộ lọc khoảng thời gian */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                days === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
        <button
          onClick={() => load(days)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-slate-400 py-16">Đang tải số liệu...</div>
      ) : !stats?.enabled ? (
        <div className="text-center text-sm text-slate-400 py-16">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          Chưa cấu hình Supabase nên chưa có số liệu.
        </div>
      ) : (
        <>
          {/* Hàng chỉ số chính */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={MessageSquare} label="Cuộc hội thoại" value={t?.sessions ?? 0} tone="text-indigo-500" hint={`${t?.messages ?? 0} tin nhắn`} />
            <Stat icon={Users} label="Khách để lại liên hệ" value={t?.leads ?? 0} tone="text-emerald-500" hint={`${t?.handoffs ?? 0} yêu cầu gặp NV`} />
            <Stat icon={TrendingUp} label="Tỉ lệ ra khách" value={`${t?.conversionRate ?? 0}%`} tone="text-amber-500" hint="lead / hội thoại" />
            <Stat icon={HelpCircle} label="Câu hỏi agent bí" value={t?.gapsOpen ?? 0} tone="text-rose-400" hint="cần bổ sung FAQ" />
          </div>

          {/* Đánh giá của khách */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Khách đánh giá câu trả lời</h3>
            {((t?.feedbackUp ?? 0) + (t?.feedbackDown ?? 0)) === 0 ? (
              <p className="text-xs text-slate-400">Chưa có lượt đánh giá nào.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <ThumbsUp className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${((t?.feedbackUp ?? 0) / ((t?.feedbackUp ?? 0) + (t?.feedbackDown ?? 0))) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-10 text-right">{t?.feedbackUp ?? 0}</span>
                </div>
                <div className="flex items-center gap-3">
                  <ThumbsDown className="w-4 h-4 text-rose-500 shrink-0" />
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{ width: `${((t?.feedbackDown ?? 0) / ((t?.feedbackUp ?? 0) + (t?.feedbackDown ?? 0))) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-10 text-right">{t?.feedbackDown ?? 0}</span>
                </div>
              </div>
            )}
          </div>

          {/* Biểu đồ theo ngày */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-1">Hội thoại &amp; khách để lại liên hệ theo ngày</h3>
            <p className="text-[10px] text-slate-400 mb-4">
              <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500 mr-1" />Hội thoại
              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 ml-3 mr-1" />Lead
            </p>
            {daily.length === 0 ? (
              <p className="text-xs text-slate-400">Chưa có dữ liệu trong khoảng thời gian này.</p>
            ) : (
              <div className="flex items-end gap-1 h-40 overflow-x-auto">
                {daily.map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-1 min-w-[22px] flex-1 group relative">
                    <div className="w-full flex items-end justify-center gap-0.5 h-32">
                      <div
                        className="w-1/2 bg-indigo-500 rounded-t transition-all"
                        style={{ height: `${Math.max(2, (d.sessions / maxDaily) * 100)}%` }}
                      />
                      <div
                        className="w-1/2 bg-emerald-500 rounded-t transition-all"
                        style={{ height: `${Math.max(2, (d.leads / maxDaily) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-slate-400 whitespace-nowrap">{d.date.slice(5)}</span>
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1 whitespace-nowrap z-10">
                      {d.date}: {d.sessions} hội thoại • {d.leads} lead
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Khung giờ cao điểm */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-1">Khung giờ khách nhắn nhiều nhất</h3>
            <p className="text-[10px] text-slate-400 mb-4">
              {peakHour >= 0 && maxHour > 1
                ? `Cao điểm khoảng ${peakHour}:00 — nên bố trí nhân viên trực khung giờ này.`
                : 'Chưa đủ dữ liệu để xác định khung giờ cao điểm.'}
            </p>
            <div className="flex items-end gap-0.5 h-24">
              {byHour.map((v, h) => (
                <div key={h} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className={`w-full rounded-t transition-all ${h === peakHour && maxHour > 1 ? 'bg-amber-500' : 'bg-slate-300'}`}
                    style={{ height: `${Math.max(2, (v / maxHour) * 70)}px` }}
                  />
                  {h % 3 === 0 && <span className="text-[8px] text-slate-400">{h}</span>}
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1 whitespace-nowrap z-10">
                    {h}:00 — {v} tin
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lead theo trạng thái */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">Tình trạng chăm sóc khách</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {STATUS_ORDER.map((s) => {
                const meta = STATUS_META[s];
                const Icon = meta.icon;
                return (
                  <div key={s} className={`p-3 rounded-xl border ${meta.cls}`}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-xl font-black">{stats?.leadsByStatus?.[s] || 0}</span>
                    </div>
                    <div className="text-[11px] font-medium mt-0.5">{meta.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
