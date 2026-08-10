// Lớp validate đầu vào nhẹ (thay cho zod vì môi trường không cài được package mới).
// Dùng như middleware: validateBody({ url: { type: 'string', required: true } })
import type { Request, Response, NextFunction } from 'express';

export type FieldRule = {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  enum?: any[];
};
export type Schema = Record<string, FieldRule>;

function checkField(name: string, value: any, rule: FieldRule): string | null {
  if (value === undefined || value === null || value === '') {
    if (rule.required) return `Thiếu trường bắt buộc: "${name}".`;
    return null; // không bắt buộc & rỗng -> bỏ qua
  }
  if (rule.type) {
    const actual = Array.isArray(value) ? 'array' : typeof value;
    if (rule.type === 'array' && !Array.isArray(value)) return `Trường "${name}" phải là mảng.`;
    if (rule.type !== 'array' && actual !== rule.type) return `Trường "${name}" phải là kiểu ${rule.type}.`;
  }
  if (rule.type === 'string' || typeof value === 'string') {
    if (rule.minLength != null && String(value).length < rule.minLength) return `Trường "${name}" quá ngắn (tối thiểu ${rule.minLength}).`;
    if (rule.maxLength != null && String(value).length > rule.maxLength) return `Trường "${name}" quá dài (tối đa ${rule.maxLength}).`;
  }
  if (rule.enum && !rule.enum.includes(value)) return `Trường "${name}" không hợp lệ (chỉ nhận: ${rule.enum.join(', ')}).`;
  return null;
}

// Kiểm tra một object theo schema; trả về mảng lỗi (rỗng nếu hợp lệ).
export function validateObject(obj: any, schema: Schema): string[] {
  const errors: string[] = [];
  const src = obj && typeof obj === 'object' ? obj : {};
  for (const [name, rule] of Object.entries(schema)) {
    const err = checkField(name, src[name], rule);
    if (err) errors.push(err);
  }
  return errors;
}

// Middleware validate req.body. KHÔNG mutate body; chỉ chặn khi có lỗi.
export function validateBody(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors = validateObject(req.body, schema);
    if (errors.length) {
      return res.status(400).json({ error: errors[0], code: 'VALIDATION_ERROR', details: errors });
    }
    next();
  };
}
