import { NextResponse } from "next/server";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { createClient } from "../../../../../lib/supabase/server";
import { schoolAIError } from "../../../../../lib/school-ai-error";
export const runtime = "nodejs";
export const maxDuration = 60;
const model = "openai/gpt-5.6-luna";
const schema = z.object({
  summary: z.string().max(1000),
  steps: z
    .array(
      z.object({
        section: z.enum([
          "identity",
          "facilities",
          "year",
          "curriculum",
          "classes",
          "people",
          "placement",
          "readiness",
        ]),
        title: z.string().max(150),
        reason: z.string().max(1000),
        action: z.string().max(1000),
      }),
    )
    .max(8),
});
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  const db = await createClient();
  const auth = await db.auth.getClaims();
  if (auth.error || !auth.data?.claims)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 1000)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let input: { request_id: string; locale: string };
  try {
    input = z
      .object({ request_id: z.uuid(), locale: z.enum(["id-ID", "en-US"]) })
      .parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const reserved = await db.rpc("school_setup_suggestion", {
    action: "reserve",
    request_id: input.request_id,
  });
  if (reserved.error)
    return NextResponse.json(
      { error: reserved.error.message },
      { status: reserved.error.code === "42501" ? 403 : 429 },
    );
  let inputTokens = 0,
    outputTokens = 0;
  let stage = "provider", finishReason: string | null = null;
  try {
    const result = await generateText({
      model: gateway(model),
      maxOutputTokens: 6000,
      reasoning: "low",
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(50000),
      output: Output.object({ schema }),
      system:
        "You are Olla, a school setup planning assistant. Give practical, short next steps based only on the supplied readiness checks and counts. Respect dependencies: year, periods, curricula/classes, placements, launch. Do not invent school facts, claim records are saved, or bypass unresolved readiness checks. Your output is a proposal for a school staff member to review and perform manually. Never request passwords or personal student data. Use the requested language.",
      prompt: JSON.stringify({
        locale: input.locale,
        readiness: reserved.data.context,
      }),
    });
    inputTokens = result.totalUsage.inputTokens ?? 0;
    outputTokens = result.totalUsage.outputTokens ?? 0;
    stage = "validation";
    finishReason = result.finishReason;
    const suggestion = schema.parse(result.output);
    stage = "persistence";
    const saved = await db.rpc("school_setup_suggestion", {
      action: "finish",
      request_id: input.request_id,
      payload: {
        result: suggestion,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: inputTokens * 0.0000002 + outputTokens * 0.0000012,
      },
    });
    if (saved.error) throw new Error("Unable to save setup suggestion");
    return NextResponse.json(
      {
        id: input.request_id,
        url: `/dashboard/core?suggestion=${input.request_id}`,
        result: suggestion,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      inputTokens = error.usage?.inputTokens ?? inputTokens;
      outputTokens = error.usage?.outputTokens ?? outputTokens;
      finishReason = error.finishReason ?? finishReason;
    }
    const failure = schoolAIError(error);
    console.error("school_setup_suggestion_failed", { generation_id: input.request_id, stage, code: failure.code, provider_status: failure.status, provider_type: failure.type, error_type: error instanceof Error ? error.name : "unknown", finish_reason: finishReason, input_tokens: inputTokens, output_tokens: outputTokens });
    await db.rpc("school_setup_suggestion", {
      action: "finish",
      request_id: input.request_id,
      payload: {
        result: null,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: inputTokens * 0.0000002 + outputTokens * 0.0000012,
      },
    });
    return NextResponse.json(
      { code: failure.code, generation_id: input.request_id, error: failure.code === "AI_GENERATION_FAILED" ? (input.locale === "en-US" ? "Setup suggestions are unavailable. Please retry; you can continue school setup manually." : "Saran penyiapan belum tersedia. Coba kembali; Anda dapat melanjutkan penyiapan sekolah secara manual.") : failure.message },
      { status: 502 },
    );
  }
}
