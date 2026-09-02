import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import {
  UpdateOwnTenantDto,
  UpdateTenantDto,
} from "./dto/update-tenant.dto";

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

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private async getTenantIdByUserId(userId: string) {
    const { data, error } = await this.client
      .from("users")
      .select("tenant_id")
      .eq("id", userId)
      .single();

    if (error || !data?.tenant_id) {
      throw new NotFoundException("Tenant context not found");
    }

    return data.tenant_id;
  }

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

  async create(dto: CreateTenantDto) {
    const { data, error } = await this.client
      .from("tenants")
      .insert({
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
      })
      .select(this.tenantSelect)
      .single();

    if (error?.code === "23505") {
      throw new ConflictException("Tenant code already exists");
    }

    if (error || !data) {
      throw new InternalServerErrorException("Failed to create tenant");
    }

    return data;
  }

  async updateForUser(userId: string, dto: UpdateOwnTenantDto) {
    const tenantId = await this.getTenantIdByUserId(userId);
    return this.updateRecord(tenantId, { name: dto.name.trim() });
  }

  async update(tenantId: string, dto: UpdateTenantDto) {
    const changes = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.code !== undefined && {
        code: this.normalizeCode(dto.code),
      }),
      ...(dto.is_active !== undefined && { is_active: dto.is_active }),
    };

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException("At least one tenant field is required");
    }

    return this.updateRecord(tenantId, changes);
  }

  async deactivate(tenantId: string) {
    return this.updateRecord(tenantId, { is_active: false });
  }

  private async updateRecord(
    tenantId: string,
    changes: Record<string, boolean | string>,
  ) {
    const { data, error } = await this.client
      .from("tenants")
      .update(changes)
      .eq("id", tenantId)
      .select(this.tenantSelect)
      .single();

    if (error?.code === "23505") {
      throw new ConflictException("Tenant code already exists");
    }

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
