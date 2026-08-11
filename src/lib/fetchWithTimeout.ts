// [Fix M14] fetch có timeout bằng AbortController.
// Trước đây nếu máy chủ nhận kết nối nhưng KHÔNG trả (treo), fetch chờ vô hạn -> spinner kẹt true,
// người dùng phải tải lại trang. Bọc bằng AbortController để tự hủy sau timeoutMs và ném lỗi rõ ràng.
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 45000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`timeout: quá thời gian chờ máy chủ (${Math.round(timeoutMs / 1000)}s)`);
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}
