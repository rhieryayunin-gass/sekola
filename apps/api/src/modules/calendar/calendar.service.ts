import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { CreateCalendarDto } from "./dto/create-calendar.dto";
import { UpdateCalendarDto } from "./dto/update-calendar.dto";

@Injectable()
export class CalendarService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  async create(
    userId: string,
    dto: CreateCalendarDto,
  ) {
    const { data, error } = await this.client
      .from("calendars")
      .insert({
        name: dto.name,
        description: dto.description ?? null,
        owner_user_id: userId,
      })
      .select(
        `
          id,
          name,
          description,
          owner_user_id,
          is_active,
          created_at,
          updated_at
        `,
      )
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        "Failed to create calendar",
      );
    }

    return data;
  }

  async findAll(userId: string) {
  const { data, error } = await this.client
    .from("calendars")
    .select(`
      id,
      name,
      description,
      owner_user_id,
      is_active,
      created_at,
      updated_at
    `)
    .eq("owner_user_id", userId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new InternalServerErrorException(
      "Failed to fetch calendars",
    );
  }

  return data ?? [];
}

async findOne(userId: string, calendarId: string) {
  const { data, error } = await this.client
    .from("calendars")
    .select(`
      id,
      name,
      description,
      owner_user_id,
      is_active,
      created_at,
      updated_at
    `)
    .eq("id", calendarId)
    .eq("owner_user_id", userId)
    .single();

  if (error || !data) {
    throw new NotFoundException("Calendar not found");
  }

  return data;
}

async update(
  userId: string,
  calendarId: string,
  dto: UpdateCalendarDto,
) {
  const { data, error } = await this.client
    .from("calendars")
    .update({
      ...(dto.name !== undefined && {
        name: dto.name,
      }),
      ...(dto.description !== undefined && {
        description: dto.description,
      }),
    })
    .eq("id", calendarId)
    .eq("owner_user_id", userId)
    .select(`
      id,
      name,
      description,
      owner_user_id,
      is_active,
      created_at,
      updated_at
    `)
    .single();

  if (error || !data) {
    throw new NotFoundException(
      "Calendar not found",
    );
  }

  return data;
}

async remove(
  userId: string,
  calendarId: string,
) {
  const { data, error } = await this.client
    .from("calendars")
    .delete()
    .eq("id", calendarId)
    .eq("owner_user_id", userId)
    .select("id")
    .single();

  if (error || !data) {
    throw new NotFoundException(
      "Calendar not found",
    );
  }

  return {
    success: true,
    id: data.id,
  };
}
}