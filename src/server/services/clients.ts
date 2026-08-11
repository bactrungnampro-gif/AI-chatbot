// [Giai đoạn 2 - Increment] Tầng client ngoài: khởi tạo Gemini + Supabase.
// Hàm THUẦN (chỉ đọc biến môi trường + tạo client), không phụ thuộc state của server.ts. Logic giữ NGUYÊN.
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Khởi tạo client Gemini (key lấy từ biến môi trường server).
export function getGeminiAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Khởi tạo client Supabase (URL + service role/anon key từ env). Trả null nếu chưa cấu hình.
export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
