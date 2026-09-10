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
    mutation = false,
  ) {
    const { data, error } = await this.client
      .from("calendars")
      .select("id, tenant_id, integration_managed")
      .eq("id", calendarId)
      .eq("owner_user_id", userId)
      .single();

    if (error || !data) {
      throw new NotFoundException("Calendar not found");
    }

    if (mutation && data.integration_managed) throw new BadRequestException("Manage integrated events through their source module");
    return data;
  }

  private eventFields = `
    id, calendar_id, title, description, starts_at, ends_at, is_all_day,
    event_type, recurrence_rule, requires_approval, created_at, updated_at
  `;

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
      .select(this.eventFields)
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
      .select(this.eventFields)
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
      true,
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
        event_type: dto.event_type ?? "GENERAL",
        recurrence_rule: dto.recurrence_rule ?? null,
        requires_approval: dto.requires_approval ?? false,
      })
      .select(this.eventFields)
      .single();

    if (error || !data) {
      throw new BadRequestException(
        "Failed to create calendar event",
      );
    }

    const createdEvent = data as unknown as {
      id: string;
      requires_approval: boolean;
    };

    if (createdEvent.requires_approval) {
      const { error: approvalError } = await this.client
        .from("calendar_approvals")
        .insert({ event_id: createdEvent.id });

      if (approvalError) {
        await this.client.from("calendar_events").delete().eq("id", createdEvent.id);
        throw new BadRequestException("Failed to create calendar approval");
      }
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
      true,
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
        ...(dto.event_type !== undefined && { event_type: dto.event_type }),
        ...(dto.recurrence_rule !== undefined && { recurrence_rule: dto.recurrence_rule }),
        ...(dto.requires_approval !== undefined && { requires_approval: dto.requires_approval }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("calendar_id", calendarId)
      .select(this.eventFields)
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
      true,
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

  async invite(userId: string, calendarId: string, eventId: string, participantId: string) {
    const calendar = await this.ensureCalendarOwner(userId, calendarId);
    const { data: event, error: eventError } = await this.client.from("calendar_events").select("id").eq("id", eventId).eq("calendar_id", calendarId).single();
    if (eventError || !event) throw new NotFoundException("Calendar event not found");
    const { data: participant, error: participantError } = await this.client
      .from("users").select("id, tenant_id, is_active").eq("id", participantId).single();
    if (participantError || !participant || !participant.is_active || participant.tenant_id !== calendar.tenant_id) {
      throw new NotFoundException("Participant not found in the calendar tenant");
    }
    const { data, error } = await this.client.from("calendar_event_participants").upsert({ event_id: eventId, user_id: participantId }, { onConflict: "event_id,user_id" }).select("event_id,user_id,response").single();
    if (error || !data) throw new BadRequestException("Unable to invite calendar participant");
    return data;
  }

  async respond(userId: string, eventId: string, response: "ACCEPTED" | "REJECTED") {
    const { data, error } = await this.client.from("calendar_event_participants").update({ response, responded_at: new Date().toISOString() }).eq("event_id", eventId).eq("user_id", userId).select("event_id,user_id,response").single();
    if (error || !data) throw new NotFoundException("Calendar invitation not found");
    return data;
  }

  async review(userId: string, calendarId: string, eventId: string, status: "APPROVED" | "REJECTED", note?: string) {
    await this.ensureCalendarOwner(userId, calendarId);
    const { data, error } = await this.client.from("calendar_approvals").update({ status, note: note ?? null, reviewed_by_user_id: userId, reviewed_at: new Date().toISOString() }).eq("event_id", eventId).select("event_id,status").single();
    if (error || !data) throw new NotFoundException("Calendar approval not found");
    return data;
  }
}
