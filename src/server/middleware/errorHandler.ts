import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../http/errors';

// Error-handler tập trung: đăng ký SAU tất cả route. Chuẩn hóa mọi lỗi thành JSON.
// (Express nhận diện middleware lỗi qua 4 tham số — không được bỏ `next`.)
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof AppError ? err.status : (err?.status || 500);
  const payload: any = {
    error: err?.message || 'Đã xảy ra lỗi máy chủ.',
  };
  if (err?.code) payload.code = err.code;
  if (err?.details) payload.details = err.details;
  if (status >= 500) {
    console.error('[ErrorHandler]', err);
  }
  if (res.headersSent) return; // đã gửi response -> để Express xử lý
  res.status(status).json(payload);
}
