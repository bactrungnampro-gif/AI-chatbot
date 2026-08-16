import React, { useState, useRef, useEffect } from 'react';
import { Lock, Mail, LogIn, ShieldCheck, Loader2 } from 'lucide-react';
import { signIn } from '../lib/auth';

interface LoginScreenProps {
  onSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // [Fix tự-điền] Trình duyệt/trình quản lý mật khẩu điền thẳng vào DOM mà KHÔNG kích hoạt onChange của React
  // -> ô hiện có chữ nhưng state vẫn rỗng, gây báo nhầm "Vui lòng nhập email và mật khẩu".
  // Giải pháp: giữ ref tới 2 ô, khi gửi form thì đọc thẳng giá trị thật trong DOM làm phương án dự phòng.
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Sau khi trang tải, đồng bộ lại state từ giá trị trình duyệt đã tự điền (thử vài nhịp vì autofill có độ trễ).
  useEffect(() => {
    const sync = () => {
      const e = emailRef.current?.value || '';
      const p = passwordRef.current?.value || '';
      if (e) setEmail((prev) => (prev ? prev : e));
      if (p) setPassword((prev) => (prev ? prev : p));
    };
    const timers = [100, 400, 1000].map((ms) => setTimeout(sync, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Ưu tiên state; nếu rỗng (do autofill) thì lấy giá trị thật đang hiển thị trong ô.
    const emailVal = (email || emailRef.current?.value || '').trim();
    const passVal = password || passwordRef.current?.value || '';
    if (!emailVal || !passVal) {
      setError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    setLoading(true);
    try {
      await signIn(emailVal, passVal);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại email/mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Đăng nhập Quản trị</h1>
          <p className="text-xs text-slate-500 mt-1">Trợ Lý AI Tư Vấn Khách Hàng</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5 text-slate-500" /> Email
            </label>
            <input
              ref={emailRef}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@doanhnghiep.com"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-slate-500" /> Mật khẩu
            </label>
            <input
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="text-[11px] text-slate-400 text-center mt-5 leading-relaxed">
          Tài khoản được cấp bởi quản trị viên qua Supabase Auth. Nếu chưa có tài khoản, vui lòng liên hệ quản trị viên hệ thống.
        </p>
      </div>
    </div>
  );
};
