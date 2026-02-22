export type CalendarViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

export interface CalendarDateRange {
  start: string;
  end: string;
}

export interface CalendarEventCreateData {
  databaseId: string;
  event: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    all_day: boolean;
    category: string;
    location?: string;
    recurrence?: string;
    linked_items?: Array<{ type: string; id: string; databaseId?: string; label: string }>;
  };
}
