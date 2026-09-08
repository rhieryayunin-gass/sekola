import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";
import { Transform } from "class-transformer";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() || null : value;

export class UpdateMyProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) @Transform(trim)
  full_name?: string | null;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) @MaxLength(2048) @Transform(trim)
  avatar_url?: string | null;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim)
  phone?: string | null;
  @IsOptional() @IsString() @MaxLength(160) @Transform(trim)
  emergency_contact_name?: string | null;
  @IsOptional() @IsString() @MaxLength(40) @Transform(trim)
  emergency_contact_phone?: string | null;
}
