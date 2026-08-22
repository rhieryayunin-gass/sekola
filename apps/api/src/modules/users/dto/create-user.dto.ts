import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateUserDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsEmail()
  email!: string;

  @IsUUID()
  user_level_id!: string;
}