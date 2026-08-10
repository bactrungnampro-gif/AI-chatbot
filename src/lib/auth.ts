// [Security - Giai đoạn Auth] Xác thực quản trị bằng Supabase Auth (email/password).
// Anon key là khóa công khai (publishable) nên an toàn để dùng ở client.
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;
let authEnabled = false;
let currentToken: string | null = null;
let initialized = false;

// Gọi 1 lần khi khởi động app. Lấy cấu hình công khai, tạo Supabase client, cài fetch interceptor.
export async function initAuth(): Promise<{ authEnabled: boolean }> {
  if (initialized) return { authEnabled };
  initialized = true;
  try {
    const res = await fetch('/api/public-config');
    const cfg = await res.json();
    authEnabled = !!cfg.authEnabled && !!cfg.supabaseUrl && !!cfg.supabaseAnonKey;
    if (authEnabled) {
      supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      const { data } = await supabase.auth.getSession();
      currentToken = data.session?.access_token || null;
      supabase.auth.onAuthStateChange((_event, session) => {
        currentToken = session?.access_token || null;
      });
      installFetchInterceptor();
    }
  } catch {
    authEnabled = false;
  }
  return { authEnabled };
}

// Tự động gắn Authorization: Bearer <token> cho mọi request tới /api/ khi đã đăng nhập.
let interceptorInstalled = false;
function installFetchInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: any, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string' ? input :
        input instanceof URL ? input.toString() :
        (input && input.url) ? input.url : '';
      const isApi = url.startsWith('/api/') || url.includes(window.location.origin + '/api/');
      if (isApi && currentToken) {
        const headers = new Headers(init?.headers || (input && input.headers) || undefined);
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${currentToken}`);
        init = { ...(init || {}), headers };
      }
    } catch {
      /* ignore */
    }
    return originalFetch(input, init);
  };
}

export function isAuthEnabled(): boolean {
  return authEnabled;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Hệ thống xác thực chưa được cấu hình.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentToken = data.session?.access_token || null;
  return data;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  currentToken = null;
}

// Đăng ký lắng nghe thay đổi trạng thái đăng nhập. Trả về hàm hủy đăng ký.
export function onAuthChange(cb: (loggedIn: boolean) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(!!session));
  return () => data.subscription.unsubscribe();
}
