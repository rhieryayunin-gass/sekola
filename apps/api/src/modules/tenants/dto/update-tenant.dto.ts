import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Max,
  Min,
  IsUrl,
} from "class-validator";

export class UpdateOwnTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional() @IsString() @MaxLength(160) legal_name?: string | null;
  @IsOptional() @IsString() @MaxLength(500) address?: string | null;
  @IsOptional() @IsEmail() @MaxLength(254) contact_email?: string | null;
  @IsOptional() @IsString() @MaxLength(40) contact_phone?: string | null;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2048) website_url?: string | null;
  @IsOptional() @IsString() @MaxLength(80) academic_year_label?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(6) week_starts_on?: number;
  @IsOptional() @IsBoolean() notifications_email_enabled?: boolean;
  @IsOptional() @IsBoolean() notifications_in_app_enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsIn(["id-ID", "en-US"]) locale?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,32}$/)
  code?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
