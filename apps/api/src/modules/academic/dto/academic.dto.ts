import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
export class YearDto { @IsString() @MinLength(2) @MaxLength(120) name!:string; @IsDateString() starts_on!:string; @IsDateString() ends_on!:string; @IsOptional() @IsBoolean() is_active?:boolean; }
export class SemesterDto extends YearDto { @IsUUID() academic_year_id!:string; }
export class ClassroomDto { @IsUUID() academic_year_id!:string; @IsString() @MinLength(2) @MaxLength(120) name!:string; @IsOptional() @Type(()=>Number) @IsInt() @Min(0) @Max(1000) capacity?:number; @IsOptional() @IsUUID() homeroom_teacher_user_id?:string|null; @IsOptional() @IsBoolean() is_active?:boolean; }
export class SubjectDto { @IsString() @Matches(/^[A-Z0-9_-]{2,32}$/) @Transform(({value})=>typeof value==='string'?value.trim().toUpperCase():value) code!:string; @IsString() @MinLength(2) @MaxLength(160) name!:string; @IsOptional() @IsString() @MaxLength(2000) description?:string; @IsOptional() @IsBoolean() is_active?:boolean; }
