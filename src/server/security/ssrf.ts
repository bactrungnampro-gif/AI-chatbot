// [Security] Chống SSRF: chặn server truy cập tài nguyên nội bộ (localhost, dải IP private,
// link-local 169.254.x — nơi chứa cloud metadata). Áp dụng cho MỌI fetch tới URL do người dùng cung cấp.
import dns from "dns/promises";
import net from "net";

export function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 10) return true;                                  // 10.0.0.0/8
    if (p[0] === 127) return true;                                 // loopback
    if (p[0] === 0) return true;                                   // 0.0.0.0/8
    if (p[0] === 169 && p[1] === 254) return true;                 // link-local / cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;     // 172.16.0.0/12
    if (p[0] === 192 && p[1] === 168) return true;                 // 192.168.0.0/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;    // CGNAT 100.64.0.0/10
    return false;
  }
  if (type === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;                    // loopback / unspecified
    if (v.startsWith('fc') || v.startsWith('fd')) return true;     // unique local
    if (v.startsWith('fe80')) return true;                         // link-local
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));   // IPv4-mapped
    return false;
  }
  return false;
}

// Trả về URL đã chuẩn hóa nếu an toàn, ném lỗi nếu không. Có phân giải DNS để chặn hostname trỏ về IP nội bộ.
export async function assertSafeExternalUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL không hợp lệ.");
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error("Chỉ hỗ trợ URL http/https.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    throw new Error("Không cho phép truy cập tài nguyên nội bộ.");
  }
  // Nếu hostname đã là IP literal, kiểm tra trực tiếp
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Không cho phép truy cập địa chỉ IP nội bộ.");
    return parsed.toString();
  }
  // Phân giải DNS và kiểm tra mọi bản ghi
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length) throw new Error("Không phân giải được tên miền.");
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error("Tên miền trỏ về địa chỉ IP nội bộ (bị chặn để phòng chống SSRF).");
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('SSRF') || e?.message?.includes('nội bộ')) throw e;
    throw new Error("Không thể xác thực an toàn cho tên miền: " + (e?.message || String(e)));
  }
  return parsed.toString();
}

// Wrapper fetch có kiểm tra SSRF. Dùng cho mọi lời gọi fetch tới URL do người dùng cung cấp.
export async function safeFetch(rawUrl: string, options?: any): Promise<Response> {
  const safeUrl = await assertSafeExternalUrl(rawUrl);
  return fetch(safeUrl, options);
}
