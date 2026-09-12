import { GatewayError } from "@ai-sdk/gateway";
import { APICallError } from "ai";

// Never expose provider messages, request bodies, headers, or credentials.
export function schoolAIError(error: unknown) {
 let current = error;
 let status: number | null = null;
 let type = "generation_error";
 for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
  if (GatewayError.isInstance(current)) { status = current.statusCode; type = current.type; break; }
  if (APICallError.isInstance(current)) { status = current.statusCode ?? null; type = "provider_error"; }
  current = current.cause;
 }
 const code = status === 401 || status === 403 ? "AI_AUTH_REQUIRED" : status === 402 ? "AI_BUDGET_EXCEEDED" : status === 404 ? "AI_MODEL_UNAVAILABLE" : status === 429 ? "AI_RATE_LIMITED" : "AI_GENERATION_FAILED";
 const messages = {
  AI_AUTH_REQUIRED: "Layanan AI belum dapat diakses. Hubungi administrator sekolah untuk memeriksa aktivasi AI.",
  AI_BUDGET_EXCEEDED: "Kuota layanan AI belum tersedia. Hubungi administrator sekolah untuk memeriksa kuota.",
  AI_MODEL_UNAVAILABLE: "Model AI sedang tidak tersedia. Silakan hubungi administrator sekolah.",
  AI_RATE_LIMITED: "Layanan AI sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.",
  AI_GENERATION_FAILED: "Pembuatan soal belum berhasil. Silakan coba lagi; Anda tetap dapat menulis soal manual.",
 };
 return { code, message: messages[code], status, type };
}
