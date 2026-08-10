// Lỗi ứng dụng có mã HTTP, để error-handler tập trung trả về đúng status.
export class AppError extends Error {
  status: number;
  code?: string;
  details?: any;
  constructor(message: string, status = 500, code?: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}
