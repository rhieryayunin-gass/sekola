import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { CreateCalendarEventDto } from "./dto/create-calendar-event.dto";
import { UpdateCalendarEventDto } from "./dto/update-calendar-event.dto";

@Injectable()
export class CalendarEventsService {
  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  private get client() {
    return this.supabaseService.getClient();
  }

  async findAll(
    userId: string,
    calendarId: string,
  ) {
    const { data, error } = await this.client
      .from("calendar_events")
      .select(`
        id,
        calendar_id,
        title,
        description,
        starts_at,
        ends_at,
        is_all_day,
        created_at,
        updated_at
      `)
      .eq("calendar_id", calendarId)
      .order("starts_at", {
        ascending: true,
      });

    if (error) {
      throw new NotFoundException(
        "Calendar events not found",
      );
    }

    return data;
  }

  async findOne(
    userId: string,
    calendarId: string,
    eventId: string,
  ) {
    const { data, error } = await this.client
      .from("calendar_events")
      .select(`
        id,
        calendar_id,
        title,
        description,
        starts_at,
        ends_at,
        is_all_day,
        created_at,
        updated_at
      `)
      .eq("id", eventId)
      .eq("calendar_id", calendarId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "Calendar event not found",
      );
    }

    return data;
  }

  async create(
    userId: string,
    calendarId: string,
    dto: CreateCalendarEventDto,
  ) {
    const { data, error } = await this.client
      .from("calendar_events")
      .insert({
        calendar_id: calendarId,
        title: dto.title,
        description: dto.description,
        starts_at: dto.starts_at,
        ends_at: dto.ends_at,
        is_all_day: dto.is_all_day ?? false,
      })
      .select(`
        id,
        calendar_id,
        title,
        description,
        starts_at,
        ends_at,
        is_all_day,
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

  async update(
    userId: string,
    calendarId: string,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ) {
    const { data, error } = await this.client
      .from("calendar_events")
      .update({
        ...(dto.title !== undefined && {
          title: dto.title,
        }),
        ...(dto.description !== undefined && {
          description: dto.description,
        }),
        ...(dto.starts_at !== undefined && {
          starts_at: dto.starts_at,
        }),
        ...(dto.ends_at !== undefined && {
          ends_at: dto.ends_at,
        }),
        ...(dto.is_all_day !== undefined && {
          is_all_day: dto.is_all_day,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("calendar_id", calendarId)
      .select(`
        id,
        calendar_id,
        title,
        description,
        starts_at,
        ends_at,
        is_all_day,
        created_at,
        updated_at
      `)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "Calendar event not found",
      );
    }

    return data;
  }

  async remove(
    userId: string,
    calendarId: string,
    eventId: string,
  ) {
    const { data, error } = await this.client
      .from("calendar_events")
      .delete()
      .eq("id", eventId)
      .eq("calendar_id", calendarId)
      .select("id")
      .single();

    if (error || !data) {
      throw new NotFoundException(
        "Calendar event not found",
      );
    }

    return {
      success: true,
      id: data.id,
    };
  }
}