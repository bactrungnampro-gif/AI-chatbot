import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../http/errors';

// Error-handler tập trung: đăng ký SAU tất cả route. Chuẩn hóa mọi lỗi thành JSON.
// (Express nhận diện middleware lỗi qua 4 tham số — không được bỏ `next`.)
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof AppError ? err.status : (err?.status || 500);
  // [Fix M17] Lỗi máy chủ (>=500) -> KHÔNG lộ chi tiết nội bộ ra client (chỉ log ở server).
  const isServerErr = status >= 500;
  const payload: any = {
    error: isServerErr ? 'Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau.' : (err?.message || 'Yêu cầu không hợp lệ.'),
  };
  if (err?.code) payload.code = err.code;
  if (!isServerErr && err?.details) payload.details = err.details; // chỉ đính details cho lỗi phía client (<500)
  if (isServerErr) {
    console.error('[ErrorHandler]', err);
  }
  if (res.headersSent) return; // đã gửi response -> để Express xử lý
  res.status(status).json(payload);
}
