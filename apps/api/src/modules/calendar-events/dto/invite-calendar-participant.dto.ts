import { IsUUID } from "class-validator";
export class InviteCalendarParticipantDto { @IsUUID() user_id!: string; }
