import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";

@Injectable()
export class ReadinessService {
  private pending?: Promise<{ status: string }>;
  constructor(private readonly supabase: SupabaseService) {}
  check() {
    // Coalesce simultaneous probes, but do not keep stale successful results.
    this.pending ??= this.probe().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async probe() {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const query = this.supabase.getClient().from("calendar_events")
        .select("id,source_table,source_id").limit(1).abortSignal(controller.signal);
      const result = await Promise.race([
        Promise.resolve(query),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, 2000);
        }),
      ]);
      if (result.error) throw new Error("database unavailable");
      return { status: "ready" };
    } catch {
      // No database URL, SQL, record data, or dependency error in public output.
      throw new ServiceUnavailableException("Service is not ready");
    } finally { if (timer) clearTimeout(timer); }
  }
}
