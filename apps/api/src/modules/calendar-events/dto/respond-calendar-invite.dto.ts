import { IsIn } from "class-validator";
export class RespondCalendarInviteDto { @IsIn(["ACCEPTED", "REJECTED"]) response!: "ACCEPTED" | "REJECTED"; }
