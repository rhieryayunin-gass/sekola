import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsIn,
} from "class-validator";

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @IsOptional()
  @IsBoolean()
  is_all_day?: boolean;
  @IsOptional() @IsIn(["GENERAL", "MEETING", "HOLIDAY", "DEADLINE"])
  event_type?: string;
  @IsOptional() @IsString()
  recurrence_rule?: string | null;
  @IsOptional() @IsBoolean()
  requires_approval?: boolean;
}
