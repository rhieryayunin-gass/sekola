import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewCalendarApprovalDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  note?: string;
}
