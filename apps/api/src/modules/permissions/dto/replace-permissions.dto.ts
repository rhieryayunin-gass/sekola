import { ArrayUnique, IsArray, IsUUID } from "class-validator";

export class ReplacePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  ids!: string[];
}
