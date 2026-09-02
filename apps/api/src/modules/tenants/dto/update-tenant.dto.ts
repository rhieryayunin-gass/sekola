import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateOwnTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;
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
