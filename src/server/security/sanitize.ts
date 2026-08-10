// [Security] Tiện ích làm sạch dữ liệu ở phía server.

// Escape để chống XSS phản chiếu khi nội suy dữ liệu vào HTML.
export function escapeHtml(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Chuyển object thành JSON an toàn để nhúng trong thẻ <script> (chặn breakout </script> và ký tự đặc biệt).
export function jsonForScript(obj: any): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// Loại bỏ các trường bí mật khỏi agentConfig (không lưu ở store, không gửi về client).
// API key AI & credential Supabase chỉ nằm ở biến môi trường server.
export function stripAiSecrets(cfg: any): any {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const clone: any = { ...cfg };
  delete clone.customApiKey;
  delete clone.providerApiKeys;
  delete clone.providerEndpoints;
  delete clone.customApiEndpoint;
  delete clone.supabaseConfig; // credential Supabase chỉ ở env server
  return clone;
}
