import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
export class OwnerCreateUserDto {
  @IsUUID() tenant_id!: string;
  @IsString() @MinLength(2) @MaxLength(160) full_name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsIn(["OWNER", "PRINCIPAL", "STAFF", "TEACHER", "STUDENT", "PARENT"]) role!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class OwnerUpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) full_name?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsIn(["OWNER", "PRINCIPAL", "STAFF", "TEACHER", "STUDENT", "PARENT"]) role?: string;
}
export class OwnerPasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class OwnerStatusDto {
  @IsBoolean() is_active!: boolean;
}
