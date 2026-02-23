import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
} from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TextFieldModule } from '@angular/cdk/text-field';
import {
  EventEntry,
  EventDatabaseService,
} from '../../../../core/services/event-database.service';
import {
  EventCategory,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from '../../../../shared/models/event-constants';
import {
  DocumentDatabase,
  LinkedItem,
  createEventDatabaseConfig,
} from '../../../../features/documents/models/database.model';
import { GoogleCalendarReminder } from '../../../google-calendar/models/google-calendar.model';
import { DatabaseService } from '../../../../features/documents/services/database.service';
import { RecurrencePickerComponent } from '../recurrence-picker/recurrence-picker.component';
import { LinkedItemsPickerComponent } from '../linked-items-picker/linked-items-picker.component';

// =====================================================================
// Interfaces
// =====================================================================

export interface EventFormDialogData {
  mode: 'create' | 'edit';
  event?: EventEntry;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
}

export interface EventFormDialogResult {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  category: EventCategory;
  location: string;
  recurrence: string;
  linked_items: LinkedItem[];
  reminders: GoogleCalendarReminder[];
  databaseId: string;
}

interface EventForm {
  title: FormControl<string>;
  description: FormControl<string>;
  startDate: FormControl<Date | null>;
  startTime: FormControl<string>;
  endDate: FormControl<Date | null>;
  endTime: FormControl<string>;
  allDay: FormControl<boolean>;
  category: FormControl<EventCategory>;
  location: FormControl<string>;
  recurrence: FormControl<string>;
  linkedItems: FormControl<LinkedItem[]>;
  reminders: FormControl<GoogleCalendarReminder[]>;
  databaseId: FormControl<string>;
}

interface CategoryOption {
  value: EventCategory;
  label: string;
  colors: { bg: string; text: string; border: string };
}

@Component({
  selector: 'app-event-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TextFieldModule,
    RecurrencePickerComponent,
    LinkedItemsPickerComponent,
  ],
  templateUrl: './event-form-dialog.component.html',
  styleUrls: ['./event-form-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventFormDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<EventFormDialogComponent>);
  private readonly data: EventFormDialogData = inject(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly eventDatabaseService = inject(EventDatabaseService);
  private readonly databaseService = inject(DatabaseService);

  // State signals
  readonly isLoading = signal(false);
  readonly eventDatabases = signal<DocumentDatabase[]>([]);
  readonly showDatabaseSelector = signal(false);

  // Mode
  readonly isEditMode = this.data.mode === 'edit';
  readonly dialogTitle = this.isEditMode ? 'Modifier l\'événement' : 'Nouvel événement';

  // Category options built from constants
  readonly categoryOptions: CategoryOption[] = (
    Object.keys(CATEGORY_LABELS) as EventCategory[]
  ).map(key => ({
    value: key,
    label: CATEGORY_LABELS[key],
    colors: CATEGORY_COLORS[key],
  }));

  // Form
  readonly form: FormGroup<EventForm> = this.fb.group<EventForm>({
    title: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
    description: new FormControl<string>('', { nonNullable: true }),
    startDate: new FormControl<Date | null>(null, {
      validators: [Validators.required],
    }),
    startTime: new FormControl<string>('09:00', { nonNullable: true }),
    endDate: new FormControl<Date | null>(null, {
      validators: [Validators.required],
    }),
    endTime: new FormControl<string>('10:00', { nonNullable: true }),
    allDay: new FormControl<boolean>(false, { nonNullable: true }),
    category: new FormControl<EventCategory>('other', { nonNullable: true }),
    location: new FormControl<string>('', { nonNullable: true }),
    recurrence: new FormControl<string>('', { nonNullable: true }),
    linkedItems: new FormControl<LinkedItem[]>([], { nonNullable: true }),
    reminders: new FormControl<GoogleCalendarReminder[]>([], { nonNullable: true }),
    databaseId: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  // =====================================================================
  // Lifecycle
  // =====================================================================

  ngOnInit(): void {
    this.loadEventDatabases();
    this.populateFormFromData();
  }

  // =====================================================================
  // Data Loading
  // =====================================================================

  private loadEventDatabases(): void {
    this.eventDatabaseService.getAllEventDatabases().subscribe({
      next: (databases) => {
        if (databases.length === 0) {
          // No event database exists — create a default one automatically
          this.createDefaultEventDatabase();
          return;
        }

        this.eventDatabases.set(databases);
        this.form.controls.databaseId.setValue(databases[0].database_id);

        // Only show selector if there are multiple databases
        this.showDatabaseSelector.set(databases.length > 1);
      },
      error: (err) => {
        console.error('[EventFormDialog] Failed to load event databases:', err);
      },
    });
  }

  private createDefaultEventDatabase(): void {
    const config = createEventDatabaseConfig('Calendrier');
    this.databaseService.createStandaloneDatabase(config).subscribe({
      next: (result) => {
        // Reload databases after creation
        this.eventDatabaseService.getAllEventDatabases().subscribe({
          next: (databases) => {
            this.eventDatabases.set(databases);
            if (databases.length > 0) {
              this.form.controls.databaseId.setValue(databases[0].database_id);
            }
            this.showDatabaseSelector.set(false);
          },
        });
      },
      error: (err) => {
        console.error('[EventFormDialog] Failed to create default event database:', err);
      },
    });
  }

  private populateFormFromData(): void {
    if (this.isEditMode && this.data.event) {
      const event = this.data.event;

      const startDateObj = new Date(event.start_date);
      const endDateObj = new Date(event.end_date);

      this.form.patchValue({
        title: event.title,
        description: event.description ?? '',
        startDate: startDateObj,
        startTime: this.formatTime(startDateObj),
        endDate: endDateObj,
        endTime: this.formatTime(endDateObj),
        allDay: event.all_day,
        category: event.category,
        location: event.location ?? '',
        recurrence: event.recurrence ?? '',
        linkedItems: event.linked_items ?? [],
        reminders: event.reminders ?? [],
        databaseId: event.databaseId,
      });

      // In edit mode, database cannot be changed
      this.form.controls.databaseId.disable();
    } else {
      // Create mode: pre-fill dates if provided
      if (this.data.startDate) {
        const start = new Date(this.data.startDate);
        this.form.controls.startDate.setValue(start);
        this.form.controls.startTime.setValue(this.formatTime(start));
      } else {
        const now = new Date();
        // Round to next half-hour for a cleaner default
        const minutes = now.getMinutes();
        now.setMinutes(minutes < 30 ? 30 : 0);
        if (minutes >= 30) now.setHours(now.getHours() + 1);
        now.setSeconds(0, 0);
        this.form.controls.startDate.setValue(now);
        this.form.controls.startTime.setValue(this.formatTime(now));
      }

      if (this.data.endDate) {
        const end = new Date(this.data.endDate);
        this.form.controls.endDate.setValue(end);
        this.form.controls.endTime.setValue(this.formatTime(end));
      } else {
        // Default: 1 hour after start
        const startDate = this.form.controls.startDate.value!;
        const [h, m] = this.form.controls.startTime.value.split(':').map(Number);
        const defaultEnd = new Date(startDate);
        defaultEnd.setHours((h ?? 0) + 1, m ?? 0, 0, 0);
        this.form.controls.endDate.setValue(defaultEnd);
        this.form.controls.endTime.setValue(this.formatTime(defaultEnd));
      }

      if (this.data.allDay !== undefined) {
        this.form.controls.allDay.setValue(this.data.allDay);
      }
    }
  }

  // =====================================================================
  // UI Helpers
  // =====================================================================

  get isAllDay(): boolean {
    return this.form.controls.allDay.value;
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    const formValue = this.form.getRawValue();
    const startIso = this.combineDateAndTime(
      formValue.startDate,
      formValue.allDay ? '00:00' : formValue.startTime
    );
    const endIso = this.combineDateAndTime(
      formValue.endDate,
      formValue.allDay ? '23:59' : formValue.endTime
    );

    const result: EventFormDialogResult = {
      title: formValue.title.trim(),
      description: formValue.description.trim(),
      start_date: startIso,
      end_date: endIso,
      all_day: formValue.allDay,
      category: formValue.category,
      location: formValue.location.trim(),
      recurrence: formValue.recurrence,
      linked_items: formValue.linkedItems,
      reminders: formValue.reminders,
      databaseId: formValue.databaseId,
    };

    this.isLoading.set(false);
    this.dialogRef.close(result);
  }

  // =====================================================================
  // Reminder Helpers
  // =====================================================================

  addReminder(): void {
    const current = this.form.controls.reminders.value;
    this.form.controls.reminders.setValue([
      ...current,
      { method: 'popup', minutes: 15 },
    ]);
  }

  removeReminder(index: number): void {
    const current = [...this.form.controls.reminders.value];
    current.splice(index, 1);
    this.form.controls.reminders.setValue(current);
  }

  updateReminderMethod(index: number, method: 'popup' | 'email'): void {
    const current = [...this.form.controls.reminders.value];
    current[index] = { ...current[index], method };
    this.form.controls.reminders.setValue(current);
  }

  updateReminderMinutes(index: number, minutes: number): void {
    const current = [...this.form.controls.reminders.value];
    current[index] = { ...current[index], minutes };
    this.form.controls.reminders.setValue(current);
  }

  // =====================================================================
  // Date/Time Helpers
  // =====================================================================

  private combineDateAndTime(date: Date | null, time: string): string {
    if (!date) {
      return new Date().toISOString();
    }

    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return combined.toISOString();
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
