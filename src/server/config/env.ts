// [Giai đoạn 2 - Increment] Tầng cấu hình: gom các HẰNG SỐ đọc từ biến môi trường về một nơi.
// QUAN TRỌNG: module này TỰ gọi dotenv.config() ở đầu, vì các import được nạp TRƯỚC thân server.ts
// -> đảm bảo process.env đã có giá trị từ file .env trước khi đọc các hằng số bên dưới.
// Các giá trị/định nghĩa được giữ NGUYÊN so với bản cũ trong server.ts (không đổi hành vi).
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// [Security] Giới hạn kích thước body. Cấu hình qua MAX_BODY_SIZE (mặc định 15mb).
export const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || '15mb';

// [Security] Rate limiting: cửa sổ (ms), giới hạn chung, giới hạn riêng /api/chat.
export const RL_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
export const RL_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
export const RL_CHAT_MAX = parseInt(process.env.RATE_LIMIT_CHAT_MAX || '20', 10);

// CORS: danh sách origin quản trị (phân tách bằng dấu phẩy).
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// [Auth] Bật xác thực Supabase; danh sách email quản trị được phép đăng nhập.
export const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Bí mật cho các lời gọi nội bộ server-đến-server (sinh ngẫu nhiên mỗi lần khởi động; không lộ ra ngoài).
export const INTERNAL_API_SECRET = crypto.randomBytes(24).toString('hex');

// [RAG] Cấu hình truy hồi ngữ nghĩa.
export const RAG_ENABLED = process.env.RAG_ENABLED === 'true';
export const RAG_MAX_CHUNKS = parseInt(process.env.RAG_MAX_CHUNKS || '3000', 10);
export const RAG_MATCH_COUNT = parseInt(process.env.RAG_MATCH_COUNT || '12', 10);
export const LINK_DIR_MAX_CHARS = parseInt(process.env.LINK_DIR_MAX_CHARS || '16000', 10);
export const RAG_AUTO_INDEX = RAG_ENABLED && process.env.RAG_AUTO_INDEX !== 'false';

// [Security] Bí mật để ký tham số OAuth `state` (chống CSRF/nhầm phiên).
export const OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || crypto.randomBytes(32).toString('hex');
