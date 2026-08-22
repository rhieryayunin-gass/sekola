import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUUID()
  user_level_id?: string;
}