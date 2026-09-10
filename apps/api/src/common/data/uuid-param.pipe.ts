import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { isUUID } from "class-validator";

@Injectable()
export class UuidParamPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === "param" && /(^id$|Id$|_id$)/.test(metadata.data ?? "") && (typeof value !== "string" || !isUUID(value))) throw new BadRequestException("Invalid resource ID");
    return value;
  }
}
