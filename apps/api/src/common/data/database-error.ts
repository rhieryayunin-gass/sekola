import { BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException, NotFoundException } from "@nestjs/common";

export function databaseError(error: { code?: string } | null, message = "Unable to complete request"): never {
  if (error?.code === "23505" || error?.code === "23P01" || error?.code === "40001") throw new ConflictException("Conflicting record or stale request");
  if (error?.code === "23503" || error?.code === "23514" || error?.code === "23502" || error?.code?.startsWith("22")) throw new BadRequestException("Invalid data or related record");
  if (error?.code === "42501") throw new ForbiddenException("Operation is not permitted");
  if (error?.code === "P0002") throw new NotFoundException("Record not found");
  throw new InternalServerErrorException(message);
}
