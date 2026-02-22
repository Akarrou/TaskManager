import {
  Component,
  ChangeDetectionStrategy,
  forwardRef,
  signal,
  effect,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { RRule, Frequency, Weekday } from 'rrule';

type FrequencyOption = 'daily' | 'weekly' | 'monthly' | 'yearly';
type EndType = 'never' | 'count' | 'until';

interface FrequencyChoice {
  value: FrequencyOption;
  label: string;
  unitLabel: string;
}

const FREQUENCY_CHOICES: FrequencyChoice[] = [
  { value: 'daily', label: 'Quotidien', unitLabel: 'jour(s)' },
  { value: 'weekly', label: 'Hebdomadaire', unitLabel: 'semaine(s)' },
  { value: 'monthly', label: 'Mensuel', unitLabel: 'mois' },
  { value: 'yearly', label: 'Annuel', unitLabel: 'an(s)' },
];

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const RRULE_WEEKDAYS: Weekday[] = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU,
];

const FREQUENCY_MAP: Record<FrequencyOption, Frequency> = {
  daily: Frequency.DAILY,
  weekly: Frequency.WEEKLY,
  monthly: Frequency.MONTHLY,
  yearly: Frequency.YEARLY,
};

const REVERSE_FREQUENCY_MAP: Record<number, FrequencyOption> = {
  [Frequency.DAILY]: 'daily',
  [Frequency.WEEKLY]: 'weekly',
  [Frequency.MONTHLY]: 'monthly',
  [Frequency.YEARLY]: 'yearly',
};

@Component({
  selector: 'app-recurrence-picker',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatRadioModule,
  ],
  templateUrl: './recurrence-picker.component.html',
  styleUrls: ['./recurrence-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RecurrencePickerComponent),
      multi: true,
    },
  ],
})
export class RecurrencePickerComponent implements ControlValueAccessor {
  // ControlValueAccessor callbacks
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  // State signals
  readonly enabled = signal(false);
  readonly frequency = signal<FrequencyOption>('weekly');
  readonly interval = signal(1);
  readonly weekDays = signal<boolean[]>([false, false, false, false, false, false, false]);
  readonly endType = signal<EndType>('never');
  readonly endCount = signal(10);
  readonly endDate = signal<Date | null>(null);
  readonly isDisabled = signal(false);

  // Exposed constants for template
  readonly frequencyChoices = FREQUENCY_CHOICES;
  readonly dayLabels = DAY_LABELS;

  // Computed: current frequency unit label
  readonly currentUnitLabel = computed(() => {
    const freq = this.frequency();
    return FREQUENCY_CHOICES.find(f => f.value === freq)?.unitLabel ?? '';
  });

  constructor() {
    // Rebuild RRULE whenever any state changes
    effect(() => {
      // Read all signals to track dependencies
      const isEnabled = this.enabled();
      this.frequency();
      this.interval();
      this.weekDays();
      this.endType();
      this.endCount();
      this.endDate();

      if (isEnabled) {
        const rruleStr = this.buildRRule();
        this.onChange(rruleStr);
      } else {
        this.onChange('');
      }
    });
  }

  // =====================================================================
  // ControlValueAccessor Implementation
  // =====================================================================

  writeValue(value: string): void {
    if (value && value.trim().length > 0) {
      this.parseRRule(value);
      this.enabled.set(true);
    } else {
      this.enabled.set(false);
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  // =====================================================================
  // UI Event Handlers
  // =====================================================================

  onEnabledChange(value: string): void {
    this.enabled.set(value === 'enabled');
    this.onTouched();
  }

  onFrequencyChange(value: FrequencyOption): void {
    this.frequency.set(value);
  }

  onIntervalChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 1) {
      this.interval.set(val);
    }
  }

  onWeekDayToggle(index: number): void {
    const current = [...this.weekDays()];
    current[index] = !current[index];
    this.weekDays.set(current);
  }

  onEndTypeChange(value: EndType): void {
    this.endType.set(value);
  }

  onEndCountChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 1) {
      this.endCount.set(val);
    }
  }

  onEndDateChange(date: Date | null): void {
    this.endDate.set(date);
  }

  // =====================================================================
  // RRULE Builder & Parser
  // =====================================================================

  buildRRule(): string {
    const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
      freq: FREQUENCY_MAP[this.frequency()],
      interval: this.interval(),
    };

    // Weekly: add selected days
    if (this.frequency() === 'weekly') {
      const selectedDays = this.weekDays()
        .map((selected, index) => (selected ? RRULE_WEEKDAYS[index] : null))
        .filter((day): day is Weekday => day !== null);

      if (selectedDays.length > 0) {
        options.byweekday = selectedDays;
      }
    }

    // End condition
    const endTypeVal = this.endType();
    if (endTypeVal === 'count') {
      options.count = this.endCount();
    } else if (endTypeVal === 'until') {
      const untilDate = this.endDate();
      if (untilDate) {
        options.until = untilDate;
      }
    }

    const rule = new RRule(options as ConstructorParameters<typeof RRule>[0]);
    return rule.toString();
  }

  parseRRule(rruleStr: string): void {
    try {
      const rule = RRule.fromString(rruleStr);
      const options = rule.origOptions;

      // Frequency
      if (options.freq !== undefined && options.freq !== null) {
        const freqOption = REVERSE_FREQUENCY_MAP[options.freq];
        if (freqOption) {
          this.frequency.set(freqOption);
        }
      }

      // Interval
      this.interval.set(options.interval ?? 1);

      // Week days
      if (options.byweekday) {
        const days = [false, false, false, false, false, false, false];
        const weekdayArray = Array.isArray(options.byweekday)
          ? options.byweekday
          : [options.byweekday];

        const dayStrToNum: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
        for (const wd of weekdayArray) {
          let weekdayNum: number;
          if (typeof wd === 'number') {
            weekdayNum = wd;
          } else if (typeof wd === 'string') {
            weekdayNum = dayStrToNum[wd] ?? -1;
          } else {
            weekdayNum = (wd as { weekday: number }).weekday;
          }
          if (weekdayNum >= 0 && weekdayNum <= 6) {
            days[weekdayNum] = true;
          }
        }
        this.weekDays.set(days);
      } else {
        this.weekDays.set([false, false, false, false, false, false, false]);
      }

      // End condition
      if (options.count) {
        this.endType.set('count');
        this.endCount.set(options.count);
      } else if (options.until) {
        this.endType.set('until');
        this.endDate.set(new Date(options.until));
      } else {
        this.endType.set('never');
      }
    } catch (error) {
      console.error('[RecurrencePicker] Failed to parse RRULE:', rruleStr, error);
      // Reset to defaults on parse error
      this.frequency.set('weekly');
      this.interval.set(1);
      this.weekDays.set([false, false, false, false, false, false, false]);
      this.endType.set('never');
    }
  }
}
