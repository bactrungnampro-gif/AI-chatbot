// [Giai đoạn 2 - Increment] Middleware CORS: tách khỏi server.ts (tự chứa, chỉ dùng ALLOWED_ORIGINS từ config/env).
// Widget nhúng cần mở cho endpoint công khai, nhưng KHÔNG mở * cho toàn bộ API. Logic giữ NGUYÊN so với bản cũ.
import express from "express";
import { ALLOWED_ORIGINS } from "../config/env";

// Endpoint công khai cho widget (chat / widget.js / health / GET config) -> cho phép mọi origin (chỉ đọc/chat).
const PUBLIC_WIDGET_PATHS = ['/api/chat', '/api/widget.js', '/api/health'];

export function corsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const origin = req.headers.origin || '';
  const isPublicWidgetEndpoint =
    PUBLIC_WIDGET_PATHS.some((p) => req.path.startsWith(p)) ||
    (req.path === '/api/config' && req.method === 'GET');

  if (isPublicWidgetEndpoint) {
    // Widget có thể được nhúng ở bất kỳ domain khách hàng nào -> cho phép mọi origin (chỉ đọc/chat).
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
    // [Fix M13] Chỉ cấp CORS kèm credentials cho origin NẰM TRONG allowlist đã cấu hình.
    // (Trước đây khi allowlist rỗng, phản chiếu MỌI origin kèm credentials -> rủi ro bảo mật.)
    // Truy cập same-origin (trang quản trị cùng host) không cần CORS nên không bị ảnh hưởng.
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}
