import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : value,
  )
  full_name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) =>
    typeof value === "string"
      ? value.trim().toLowerCase()
      : value,
  )
  email?: string;

  @IsOptional()
  @IsUUID()
  user_level_id?: string;
}
