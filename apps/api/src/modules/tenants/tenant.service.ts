import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";

@Injectable()
export class TenantService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  private readonly tenantSelect = `
    id,
    name,
    code,
    is_active,
    created_at,
    updated_at
  `;

  async findAll() {
    const { data, error } = await this.client
      .from("tenants")
      .select(this.tenantSelect)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        "Failed to fetch tenants",
      );
    }

    return data ?? [];
  }

  async findOne(tenantId: string) {
    const { data, error } = await this.client
      .from("tenants")
      .select(this.tenantSelect)
      .eq("id", tenantId)
      .single();

    if (error || !data) {
      throw new NotFoundException("Tenant not found");
    }

    return data;
  }

  async findByUserId(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select(`
        tenant_id,
        tenants (
          id,
          name,
          code,
          is_active,
          created_at,
          updated_at
        )
      `)
      .eq("id", userId)
      .single();

    if (error || !data?.tenant_id) {
      throw new NotFoundException(
        "Tenant context not found",
      );
    }

    const tenant = Array.isArray(data.tenants)
      ? data.tenants[0]
      : data.tenants;

    if (!tenant) {
      throw new NotFoundException(
        "Tenant not found",
      );
    }

    return tenant;
  }
}
