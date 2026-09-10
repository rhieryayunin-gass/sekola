import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateTeamProjectDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,32}$/)
  @Transform(({ value }) => typeof value === "string" ? value.trim().toUpperCase() : value)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsIn(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"])
  status?: string;

  @IsUUID()
  owner_user_id!: string;

  @IsOptional()
  @IsDateString()
  starts_on?: string;

  @IsOptional()
  @IsDateString()
  due_on?: string;
}

export class UpdateTeamProjectDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]) status?: string;
  @IsOptional() @IsUUID() owner_user_id?: string;
  @IsOptional() @IsDateString() starts_on?: string;
  @IsOptional() @IsDateString() due_on?: string;
}

export class AddTeamProjectMemberDto {
  @IsUUID()
  user_id!: string;

  @IsOptional()
  @IsIn(["MANAGER", "MEMBER", "VIEWER"])
  member_role?: string;
}

export class UpdateTeamProjectMemberDto {
  @IsIn(["MANAGER", "MEMBER", "VIEWER"])
  member_role!: string;
}

export class UpdateTeamProjectSettingsDto {
  @IsOptional() @IsIn(["PROJECT", "TENANT"]) visibility?: string;
  @IsOptional() @IsBoolean() notifications_enabled?: boolean;
  @IsOptional() @IsBoolean() allow_member_comments?: boolean;
  @IsOptional() @IsObject() @Type(() => Object) metadata?: Record<string, unknown>;
}
