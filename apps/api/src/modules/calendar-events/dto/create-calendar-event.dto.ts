import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateCalendarEventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  starts_at!: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @IsOptional()
  @IsBoolean()
  is_all_day?: boolean;
}