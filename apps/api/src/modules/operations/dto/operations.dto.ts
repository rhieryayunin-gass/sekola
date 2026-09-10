import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateRoomDto {
  @IsString() @Matches(/^[A-Z0-9_-]{2,32}$/) @Transform(({value})=>typeof value==="string"?value.trim().toUpperCase():value) code!:string;
  @IsString() @MinLength(2) @MaxLength(160) name!:string;
  @IsOptional() @IsString() @MaxLength(500) location?:string;
  @Type(()=>Number) @IsInt() @Min(1) @Max(5000) capacity!:number;
  @IsOptional() @IsArray() facilities?:unknown[];
  @IsOptional() @IsBoolean() is_active?:boolean;
}
export class UpdateRoomDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?:string;
  @IsOptional() @IsString() @MaxLength(500) location?:string;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(5000) capacity?:number;
  @IsOptional() @IsArray() facilities?:unknown[];
  @IsOptional() @IsBoolean() is_active?:boolean;
}
export class CreateRoomBookingDto {
  @IsUUID() room_id!:string;
  @IsString() @MinLength(2) @MaxLength(200) title!:string;
  @IsOptional() @IsString() @MaxLength(4000) purpose?:string;
  @IsDateString() starts_at!:string;
  @IsDateString() ends_at!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID("4",{each:true}) approver_user_ids!:string[];
}
export class CreateApprovalRequestDto {
  @IsString() @Matches(/^[A-Z0-9_]{2,80}$/) resource_type!:string;
  @IsUUID() resource_id!:string;
  @IsString() @MinLength(2) @MaxLength(240) title!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID("4",{each:true}) approver_user_ids!:string[];
  @IsOptional() @IsObject() metadata?:Record<string,unknown>;
}
export class DecideApprovalDto {
  @IsIn(["APPROVED","REJECTED"]) decision!:"APPROVED"|"REJECTED";
  @IsOptional() @IsString() @MaxLength(4000) note?:string;
}
export class CreateLeaveRequestDto {
  @IsIn(["ANNUAL","SICK","PERSONAL","MATERNITY","PATERNITY","OTHER"]) leave_type!:string;
  @IsDateString() starts_on!:string;
  @IsDateString() ends_on!:string;
  @IsString() @MinLength(2) @MaxLength(4000) reason!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID("4",{each:true}) approver_user_ids!:string[];
}
export class CreateScheduleChangeDto {
  @IsUUID() calendar_event_id!:string;
  @IsDateString() proposed_starts_at!:string;
  @IsDateString() proposed_ends_at!:string;
  @IsString() @MinLength(2) @MaxLength(4000) reason!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID("4",{each:true}) approver_user_ids!:string[];
}
