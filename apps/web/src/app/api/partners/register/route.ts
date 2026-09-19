import { PDFDocument } from "pdf-lib";
import { createClient } from "../../../../lib/supabase/server";
export const maxDuration = 30;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 1_100_000)
    return Response.json(
      { error: "PDF maximum size is 1 MB." },
      { status: 413 },
    );
  try {
    const f = await request.formData();
    const file = f.get("cv");
    if (
      !(file instanceof File) ||
      file.type !== "application/pdf" ||
      file.size > 1048576 ||
      file.size < 5
    )
      return Response.json(
        { error: "Upload a PDF up to 1 MB." },
        { status: 400 },
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-")
      return Response.json({ error: "Invalid PDF." }, { status: 400 });
    const pdf = await PDFDocument.load(bytes);
    if (pdf.getPageCount() < 1)
      return Response.json(
        { error: "PDF must contain a page." },
        { status: 400 },
      );
    const payload = Object.fromEntries(
      [
        "name",
        "nik",
        "phone",
        "domicile",
        "occupation",
        "school_count",
      "estimated_students",
        "contacts",
        "website",
      ].map((k) => [k, String(f.get(k) ?? "").trim()]),
    );
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("school_partner_apply", {
      payload: {
        ...payload,
        photo_confirmed: f.get("photo_confirmed") === "on",
        consent: f.get("consent") === "on",
        cv_name: file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180),
      },
      cv_base64: Buffer.from(bytes).toString("base64"),
    });
    if (error)
      return Response.json(
        {
          error:
            error.code === "P0001"
              ? "Pendaftaran sudah diterima atau kuota harian penuh. Hubungi tim OSEKOLA."
              : "Periksa isian formulir Anda / Please check your application.",
        },
        { status: 400 },
      );
    return Response.json(data, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "PDF atau formulir tidak dapat diproses / Unable to process the PDF or form.",
      },
      { status: 400 },
    );
  }
}
