// [Giai đoạn 2 - Increment] Middleware Rate limiting: tách khỏi server.ts (tự chứa, chỉ dùng hằng số từ config/env).
// Fixed window theo IP, trong bộ nhớ, không cần thư viện ngoài. Logic giữ NGUYÊN so với bản cũ.
import express from "express";
import { RL_WINDOW_MS, RL_MAX, RL_CHAT_MAX } from "../config/env";

const rlBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method === 'OPTIONS' || !req.path.startsWith('/api/')) return next();
  const isChat = req.path.startsWith('/api/chat');
  const limit = isChat ? RL_CHAT_MAX : RL_MAX;
  const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
  const key = `${isChat ? 'chat' : 'api'}:${ip}`;
  const now = Date.now();
  let b = rlBuckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RL_WINDOW_MS };
    rlBuckets.set(key, b);
  }
  b.count++;
  const remaining = Math.max(0, limit - b.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (b.count > limit) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfter} giây.`, code: 'RATE_LIMITED' });
  }
  next();
}

// Dọn định kỳ các bucket hết hạn để tránh rò rỉ bộ nhớ.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rlBuckets) if (now >= v.resetAt) rlBuckets.delete(k);
}, 5 * 60 * 1000).unref?.();
