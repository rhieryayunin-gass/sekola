import "reflect-metadata";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class PageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 50;
}

export function pageRange(query: PageDto = new PageDto()): [number, number] {
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const size = Math.max(1, Math.min(100, Number(query.page_size) || 50));
  return [(page - 1) * size, page * size - 1];
}
