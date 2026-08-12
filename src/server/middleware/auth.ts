// [Giai đoạn 2 - Increment] Middleware xác thực (Supabase Auth): tách khỏi server.ts.
// `getSupabaseClient` được TIÊM vào qua factory để module này không phụ thuộc trực tiếp server.ts. Logic giữ NGUYÊN.
import express from "express";
import { AUTH_ENABLED, ADMIN_EMAILS, INTERNAL_API_SECRET } from "../config/env";

// Các endpoint công khai (không cần đăng nhập): widget nhúng, health, đọc config, callback OAuth, public-config.
export function isPublicApi(req: express.Request): boolean {
  if (req.method === 'OPTIONS') return true;
  if (!req.path.startsWith('/api/')) return true; // tài nguyên frontend (để tải được màn hình đăng nhập)
  const path = req.path;
  if (path === '/api/health') return true;
  if (path === '/api/public-config') return true;
  if (path === '/api/widget.js') return true;
  if (path === '/api/auth/google/callback') return true; // Google redirect (không gắn được Bearer)
  if (path.startsWith('/api/chat')) return true;          // widget chat công khai
  if (path === '/api/lead' && req.method === 'POST') return true; // widget gửi thông tin liên hệ (lead) công khai
  if (path === '/api/handoff' && req.method === 'POST') return true; // widget yêu cầu gặp nhân viên (công khai)
  if (path === '/api/config' && req.method === 'GET') return true; // widget đọc cấu hình
  if (path === '/api/widget-config' && req.method === 'GET') return true; // widget đọc cấu hình NHẸ (không kèm tri thức)
  return false;
}

// Tạo middleware guard: chặn mọi endpoint không công khai khi AUTH_ENABLED. `getSupabaseClient` tiêm từ server.
export function createAuthMiddleware(getSupabaseClient: () => any) {
  // Xác thực token Supabase (Bearer JWT). Trả về user nếu hợp lệ.
  async function verifySupabaseToken(token: string): Promise<any | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user) return null;
      return data.user;
    } catch {
      return null;
    }
  }

  return async function authGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!AUTH_ENABLED) return next();
    // Bỏ qua guard cho lời gọi nội bộ hợp lệ (server tự gọi chính mình).
    if (req.headers['x-internal-token'] === INTERNAL_API_SECRET) return next();
    if (isPublicApi(req)) return next();

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Yêu cầu đăng nhập (thiếu token).', code: 'AUTH_REQUIRED' });
    }
    const user = await verifySupabaseToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', code: 'AUTH_INVALID' });
    }
    // [Fix M12] FAIL-CLOSED: khi bật AUTH nhưng CHƯA cấu hình ADMIN_EMAILS thì CHẶN hết
    // (nếu không, bất kỳ ai có token Supabase — kể cả tự đăng ký — đều trở thành quản trị).
    if (ADMIN_EMAILS.length === 0) {
      return res.status(403).json({ error: 'Máy chủ chưa cấu hình danh sách email quản trị (ADMIN_EMAILS).', code: 'AUTH_NOT_CONFIGURED' });
    }
    if (!ADMIN_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return res.status(403).json({ error: 'Tài khoản không có quyền quản trị.', code: 'AUTH_FORBIDDEN' });
    }
    (req as any).authUser = user;
    next();
  };
}
