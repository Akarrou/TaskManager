import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal, computed, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { Store } from '@ngrx/store';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions, EventInput, DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { EventResizeDoneArg } from '@fullcalendar/interaction';
import rrulePlugin from '@fullcalendar/rrule';
import frLocale from '@fullcalendar/core/locales/fr';
import { CalendarStore } from '../../store/calendar.store';
import { EventEntry } from '../../../../core/services/event-database.service';
import { FullCalendarAdapterService } from '../../services/fullcalendar-adapter.service';
import { EventFormDialogComponent } from '../event-form-dialog/event-form-dialog.component';
import { EventDetailPanelComponent } from '../event-detail-panel/event-detail-panel.component';
import { selectActiveProjects } from '../../../projects/store/project.selectors';
import { loadProjects } from '../../../projects/store/project.actions';
import { DatabaseService } from '../../../documents/services/database.service';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    CommonModule,
    FullCalendarModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    EventDetailPanelComponent,
  ],
  templateUrl: './calendar-page.component.html',
  styleUrls: ['./calendar-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent implements OnInit {
  private calendarStore = inject(CalendarStore);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private adapter = inject(FullCalendarAdapterService);
  private store = inject(Store);
  private router = inject(Router);
  private databaseService = inject(DatabaseService);

  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;

  events = this.calendarStore.events;
  loading = this.calendarStore.loading;
  currentView = this.calendarStore.currentView;

  calendarTitle = signal('');
  showDetailPanel = signal(false);
  selectedEvent = signal<EventEntry | null>(null);

  // Project filter
  projects = signal<Array<{ id: string; name: string }>>([]);
  selectedProjectId = signal<string | null>(null);
  isProjectDropdownOpen = signal(false);
  selectedProjectLabel = computed(() => {
    const id = this.selectedProjectId();
    if (!id) return 'Tous les projets';
    return this.projects().find(p => p.id === id)?.name ?? 'Tous les projets';
  });

  calendarOptions = signal<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, rrulePlugin],
    initialView: 'dayGridMonth',
    locale: frLocale,
    firstDay: 1, // Monday
    headerToolbar: false, // Custom toolbar
    height: 'auto',
    nowIndicator: true,
    editable: true,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    slotMinTime: '06:00:00',
    slotMaxTime: '22:00:00',
    events: [],
    select: this.handleSelect.bind(this),
    eventClick: this.handleEventClick.bind(this),
    eventDrop: this.handleEventDrop.bind(this),
    eventResize: this.handleEventResize.bind(this),
    datesSet: this.handleDatesSet.bind(this),
  });

  ngOnInit(): void {
    this.loadProjects();
  }

  // =====================================================================
  // Toolbar Actions
  // =====================================================================

  navigatePrev(): void {
    this.calendarComponent?.getApi()?.prev();
  }

  navigateNext(): void {
    this.calendarComponent?.getApi()?.next();
  }

  navigateToday(): void {
    this.calendarComponent?.getApi()?.today();
  }

  changeView(view: string): void {
    const calendarView = view as 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
    this.calendarComponent?.getApi()?.changeView(calendarView);
    this.calendarStore.changeView(calendarView);
  }

  toggleProjectDropdown(): void {
    this.isProjectDropdownOpen.set(!this.isProjectDropdownOpen());
  }

  closeProjectDropdown(): void {
    this.isProjectDropdownOpen.set(false);
  }

  selectProjectFilter(projectId: string | null): void {
    this.selectedProjectId.set(projectId);
    this.closeProjectDropdown();
    this.reloadEvents();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(EventFormDialogComponent, {
      width: '1000px',
      maxWidth: '95vw',
      data: { mode: 'create' },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.calendarStore.createEvent({
          databaseId: result.databaseId,
          event: result,
        });
      }
    });
  }

  // =====================================================================
  // FullCalendar Callbacks
  // =====================================================================

  handleSelect(selectInfo: DateSelectArg): void {
    const dialogRef = this.dialog.open(EventFormDialogComponent, {
      width: '1000px',
      maxWidth: '95vw',
      data: {
        mode: 'create',
        startDate: selectInfo.startStr,
        endDate: selectInfo.endStr,
        allDay: selectInfo.allDay,
      },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.calendarStore.createEvent({
          databaseId: result.databaseId,
          event: result,
        });
      }
    });
    this.calendarComponent?.getApi()?.unselect();
    this.cdr.markForCheck();
  }

  handleEventClick(clickInfo: EventClickArg): void {
    const eventId = clickInfo.event.id;
    const event = this.events().find(e => e.id === eventId);
    if (event) {
      this.selectedEvent.set(event);
      this.showDetailPanel.set(true);
      this.calendarStore.selectEvent(eventId);
    }
    this.cdr.markForCheck();
  }

  handleEventDrop(dropInfo: EventDropArg): void {
    const event = this.events().find(e => e.id === dropInfo.event.id);
    if (event) {
      this.calendarStore.updateEvent({
        databaseId: event.databaseId,
        rowId: event.id,
        updates: {
          start_date: dropInfo.event.startStr,
          end_date: dropInfo.event.endStr || dropInfo.event.startStr,
        },
      });
    }
    this.cdr.markForCheck();
  }

  handleEventResize(resizeInfo: EventResizeDoneArg): void {
    const event = this.events().find(e => e.id === resizeInfo.event.id);
    if (event) {
      this.calendarStore.updateEvent({
        databaseId: event.databaseId,
        rowId: event.id,
        updates: {
          start_date: resizeInfo.event.startStr,
          end_date: resizeInfo.event.endStr || resizeInfo.event.startStr,
        },
      });
    }
    this.cdr.markForCheck();
  }

  handleDatesSet(dateInfo: { startStr: string; endStr: string; view: { title: string } }): void {
    this.calendarTitle.set(dateInfo.view.title);
    this.calendarStore.loadEvents({
      start: dateInfo.startStr,
      end: dateInfo.endStr,
      projectId: this.selectedProjectId() || undefined,
    });
    this.cdr.markForCheck();
  }

  // =====================================================================
  // Detail Panel
  // =====================================================================

  closeDetailPanel(): void {
    this.showDetailPanel.set(false);
    this.selectedEvent.set(null);
    this.calendarStore.selectEvent(null);
  }

  onEventUpdated(updates: { databaseId: string; rowId: string; updates: Partial<EventEntry> }): void {
    this.calendarStore.updateEvent(updates);
  }

  onEventDeleted(data: { databaseId: string; rowId: string }): void {
    this.calendarStore.deleteEvent(data);
    this.closeDetailPanel();
  }

  onNavigateToSource(databaseId: string): void {
    this.databaseService.getDatabaseMetadata(databaseId).subscribe(metadata => {
      if (metadata.document_id) {
        this.router.navigate(['/documents', metadata.document_id]);
      }
    });
  }

  onEditEvent(event: EventEntry): void {
    const dialogRef = this.dialog.open(EventFormDialogComponent, {
      width: '1000px',
      maxWidth: '95vw',
      data: { mode: 'edit', event },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.calendarStore.updateEvent({
          databaseId: result.databaseId,
          rowId: event.id,
          updates: result,
        });
      }
    });
  }

  // =====================================================================
  // Computed calendar events for FullCalendar
  // =====================================================================

  get calendarEvents(): EventInput[] {
    return this.adapter.eventEntriesToCalendarEvents(this.events());
  }

  // =====================================================================
  // Private Methods
  // =====================================================================

  private reloadEvents(): void {
    const api = this.calendarComponent?.getApi();
    if (api) {
      const view = api.view;
      this.calendarStore.loadEvents({
        start: view.activeStart.toISOString(),
        end: view.activeEnd.toISOString(),
        projectId: this.selectedProjectId() || undefined,
      });
    }
  }

  private loadProjects(): void {
    this.store.dispatch(loadProjects());
    this.store.select(selectActiveProjects).subscribe(projects => {
      this.projects.set(projects.map(p => ({ id: p.id, name: p.name })));
      this.cdr.markForCheck();
    });
  }
}
