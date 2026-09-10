import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator";

export class CreateProjectInvoiceDto {
  @IsOptional() @IsUUID() finance_category_id?: string;
  @IsString() @MinLength(2) @MaxLength(80) invoice_number!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() due_date!: string;
  @IsOptional() @IsIn(["DRAFT", "OPEN", "PARTIAL", "PAID", "VOID", "OVERDUE"]) status?: string;
}

export class CreateProjectPaymentDto {
  @IsUUID() project_invoice_id!: string;
  @IsOptional() @IsUUID() finance_account_id?: string;
  @IsString() @MinLength(2) @MaxLength(80) receipt_number!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() paid_at?: string;
  @IsOptional() @IsIn(["PENDING", "CONFIRMED", "VOID", "REFUNDED"]) status?: string;
}
