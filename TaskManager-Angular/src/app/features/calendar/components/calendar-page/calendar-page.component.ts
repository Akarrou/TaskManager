import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal, computed, inject, OnInit, OnDestroy, ViewChild, effect, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
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
import { SyncStatusIndicatorComponent } from '../../../google-calendar/components/sync-status-indicator/sync-status-indicator.component';
import { GoogleCalendarSettingsComponent } from '../../../google-calendar/components/google-calendar-settings/google-calendar-settings.component';
import { GoogleCalendarStore } from '../../../google-calendar/store/google-calendar.store';
import { selectActiveProjects } from '../../../projects/store/project.selectors';
import { loadProjects } from '../../../projects/store/project.actions';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { DatabaseService } from '../../../documents/services/database.service';
import { DocumentService } from '../../../documents/services/document.service';
import { LinkedItem } from '../../../documents/models/database.model';
import { FabStore } from '../../../../core/stores/fab.store';
import { EventCategoryStore } from '../../../../core/stores/event-category.store';
import { CATEGORY_COLOR_PALETTE } from '../../../../shared/models/event-constants';

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
    SyncStatusIndicatorComponent,
    GoogleCalendarSettingsComponent,
  ],
  templateUrl: './calendar-page.component.html',
  styleUrls: ['./calendar-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slidePanel', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(0)', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)', style({ transform: 'translateX(100%)', opacity: 0 })),
      ]),
    ]),
  ],
})
export class CalendarPageComponent implements OnInit, OnDestroy {
  private calendarStore = inject(CalendarStore);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);
  private adapter = inject(FullCalendarAdapterService);
  private store = inject(Store);
  private router = inject(Router);
  private databaseService = inject(DatabaseService);
  private documentService = inject(DocumentService);
  private fabStore = inject(FabStore);
  private renderer = inject(Renderer2);
  private categoryStore = inject(EventCategoryStore);
  private gcalStore = inject(GoogleCalendarStore);

  readonly isGoogleCalendarConnected = this.gcalStore.isConnected;
  readonly hasEnabledSyncConfigs = computed(() => this.gcalStore.enabledSyncConfigs().length > 0);
  readonly gcalLoading = this.gcalStore.loading;
  readonly gcalSyncing = computed(() => this.gcalStore.syncStatus() === 'syncing');
  readonly calendarSetupMode = signal(false);
  readonly initialLoadComplete = signal(false);

  // Dynamic <style> element for custom category colors (managed via Renderer2)
  private customCategoryStyleEl: HTMLStyleElement | null = null;

  private customCategoryStyleEffect = effect(() => {
    const customs = this.categoryStore.customCategories();
    if (!this.customCategoryStyleEl) {
      this.customCategoryStyleEl = this.renderer.createElement('style') as HTMLStyleElement;
      this.renderer.setAttribute(this.customCategoryStyleEl, 'data-custom-categories', '');
      this.renderer.appendChild(document.head, this.customCategoryStyleEl);
    }
    const css = customs.map(cat => {
      const palette = CATEGORY_COLOR_PALETTE[cat.colorKey] ?? CATEGORY_COLOR_PALETTE['gray'];
      const sel = `.fc-event.category-${cat.key}`;
      return `
        ${sel} { background-color: ${palette.bgHex} !important; border-left-color: ${palette.hex} !important; color: ${palette.textHex} !important; }
        ${sel} .fc-event-main { color: ${palette.textHex} !important; }
        ${sel} .fc-daygrid-event-dot { border-color: ${palette.hex} !important; }
        ${sel}.fc-timegrid-event { background-color: ${palette.bgHex} !important; border-color: ${palette.hex} !important; }
        ${sel}.fc-timegrid-event .fc-event-main { color: ${palette.textHex} !important; }
      `;
    }).join('\n');
    this.renderer.setProperty(this.customCategoryStyleEl, 'textContent', css);
  });

  // Synchronise la visibilité du FAB avec le panneau de détail
  private fabHiddenEffect = effect(() => {
    this.fabStore.setHidden(this.showDetailPanel());
  });

  // Synchronise le selectedEvent du store vers le signal local
  // pour que le sidebar reflète les modifications d'événements en temps réel
  private syncSelectedEventEffect = effect(() => {
    const storeEvent = this.calendarStore.selectedEvent();
    if (storeEvent) {
      this.selectedEvent.set(storeEvent);
    }
  });

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
    eventDidMount: (info) => {
      info.el.setAttribute('data-tooltip', info.event.title);
      info.el.addEventListener('dblclick', () => {
        const event = this.events().find(e => e.id === info.event.id);
        if (event) {
          this.onEditEvent(event);
        }
      });
    },
  });

  ngOnInit(): void {
    this.initializeGoogleCalendar();
    this.categoryStore.loadCategories();
    this.loadProjects();
  }

  private async initializeGoogleCalendar(): Promise<void> {
    await this.gcalStore.loadConnection();
    await this.gcalStore.loadSyncConfigs();
    // Only enter setup mode when connected but no calendars are enabled yet
    if (this.isGoogleCalendarConnected() && !this.hasEnabledSyncConfigs()) {
      this.calendarSetupMode.set(true);
    }
    this.initialLoadComplete.set(true);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.fabStore.setHidden(false);
    if (this.customCategoryStyleEl) {
      this.renderer.removeChild(document.head, this.customCategoryStyleEl);
    }
  }

  // =====================================================================
  // Toolbar Actions
  // =====================================================================

  connectGoogleCalendar(): void {
    this.gcalStore.connect();
  }

  async finishCalendarSetup(): Promise<void> {
    // Trigger sync for all enabled calendars, then show the calendar
    await this.gcalStore.triggerSync();
    this.calendarSetupMode.set(false);
  }

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
    this.calendarStore.selectEvent(null);
    // selectedEvent is cleared in onPanelAnimationDone() after the :leave animation
  }

  onPanelAnimationDone(): void {
    if (!this.showDetailPanel()) {
      this.selectedEvent.set(null);
      this.calendarComponent?.getApi()?.updateSize();
    }
  }

  onEventUpdated(updates: { databaseId: string; rowId: string; updates: Partial<EventEntry> }): void {
    this.calendarStore.updateEvent(updates);
  }

  onEventDeleted(data: { databaseId: string; rowId: string }): void {
    this.calendarStore.deleteEvent(data);
    this.closeDetailPanel();
  }

  onNavigateToSource(data: { databaseId: string; rowId: string; title: string }): void {
    this.databaseService.getRowDocument(data.databaseId, data.rowId).pipe(
      switchMap(document => {
        if (document) {
          return of(document);
        }
        return this.documentService.createDatabaseRowDocument({
          title: data.title,
          database_id: data.databaseId,
          database_row_id: data.rowId,
        });
      }),
    ).subscribe(document => {
      this.router.navigate(['/documents', document.id], { queryParams: { from: 'calendar' } });
    });
  }

  onLinkedItemClick(item: LinkedItem): void {
    switch (item.type) {
      case 'document':
        this.router.navigate(['/documents', item.id]);
        break;
      case 'database':
        this.router.navigate(['/bdd', item.id]);
        break;
      case 'task':
        if (item.databaseId) {
          this.databaseService.getRowDocument(item.databaseId, item.id).pipe(
            switchMap(document => {
              if (document) {
                return of(document);
              }
              return this.documentService.createDatabaseRowDocument({
                title: item.label,
                database_id: item.databaseId!,
                database_row_id: item.id,
              });
            }),
          ).subscribe(document => {
            this.router.navigate(['/documents', document.id]);
          });
        }
        break;
    }
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
