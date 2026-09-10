import { Transform, Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator";

export class CreateTeamTaskDto {
  @IsString() @MinLength(2) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsIn(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]) status?: string;
  @IsOptional() @IsIn(["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]) priority?: string;
  @IsOptional() @IsUUID() assignee_user_id?: string;
  @IsOptional() @IsDateString() due_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sort_order?: number;
}

export class UpdateTeamTaskDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsIn(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]) status?: string;
  @IsOptional() @IsIn(["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]) priority?: string;
  @IsOptional() @IsUUID() assignee_user_id?: string;
  @IsOptional() @IsDateString() due_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sort_order?: number;
}

export class MoveTeamTaskDto {
  @IsIn(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"])
  status!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sort_order?: number;
}

export class CreateTeamCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  body!: string;
}
