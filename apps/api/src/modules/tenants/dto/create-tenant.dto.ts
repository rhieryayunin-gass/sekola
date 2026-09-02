import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,32}$/)
  code!: string;
}
