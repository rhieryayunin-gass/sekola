import {
  BadRequestException,
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

  private async ensureCalendarOwner(
    userId: string,
    calendarId: string,
  ) {
    const { data, error } = await this.client
      .from("calendars")
      .select("id")
      .eq("id", calendarId)
      .eq("owner_user_id", userId)
      .single();

    if (error || !data) {
      throw new NotFoundException("Calendar not found");
    }
  }

  private validateEventTimes(
    startsAt: string,
    endsAt?: string | null,
  ) {
    if (!endsAt) {
      return;
    }

    const starts = new Date(startsAt);
    const ends = new Date(endsAt);

    if (
      Number.isNaN(starts.getTime()) ||
      Number.isNaN(ends.getTime())
    ) {
      return;
    }

    if (ends.getTime() < starts.getTime()) {
      throw new BadRequestException(
        "ends_at must be greater than or equal to starts_at",
      );
    }
  }

  async findAll(
    userId: string,
    calendarId: string,
  ) {
    await this.ensureCalendarOwner(
      userId,
      calendarId,
    );

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

    return data ?? [];
  }

  async findOne(
    userId: string,
    calendarId: string,
    eventId: string,
  ) {
    await this.ensureCalendarOwner(
      userId,
      calendarId,
    );

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
    await this.ensureCalendarOwner(
      userId,
      calendarId,
    );

    this.validateEventTimes(
      dto.starts_at,
      dto.ends_at,
    );

    const { data, error } = await this.client
      .from("calendar_events")
      .insert({
        calendar_id: calendarId,
        title: dto.title,
        description: dto.description ?? null,
        starts_at: dto.starts_at,
        ends_at: dto.ends_at ?? null,
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
      throw new BadRequestException(
        "Failed to create calendar event",
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
    await this.ensureCalendarOwner(
      userId,
      calendarId,
    );

    const { data: existingEvent, error: existingError } =
      await this.client
        .from("calendar_events")
        .select(`
          id,
          starts_at,
          ends_at
        `)
        .eq("id", eventId)
        .eq("calendar_id", calendarId)
        .single();

    if (existingError || !existingEvent) {
      throw new NotFoundException(
        "Calendar event not found",
      );
    }

    const startsAt =
      dto.starts_at ?? existingEvent.starts_at;

    const endsAt =
      dto.ends_at !== undefined
        ? dto.ends_at
        : existingEvent.ends_at;

    this.validateEventTimes(
      startsAt,
      endsAt,
    );

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
      throw new BadRequestException(
        "Failed to update calendar event",
      );
    }

    return data;
  }

  async remove(
    userId: string,
    calendarId: string,
    eventId: string,
  ) {
    await this.ensureCalendarOwner(
      userId,
      calendarId,
    );

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