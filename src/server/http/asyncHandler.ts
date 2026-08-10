import type { Request, Response, NextFunction } from 'express';

// Bọc route handler async: mọi lỗi ném ra được chuyển tới error-handler tập trung (thay vì treo request).
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
