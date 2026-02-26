import {
  Component,
  ChangeDetectionStrategy,
  forwardRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

import { EventGuestPermissions, DEFAULT_GUEST_PERMISSIONS } from '../../models/attendee.model';

@Component({
  selector: 'app-event-guest-permissions',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCheckboxModule,
    MatIconModule,
  ],
  templateUrl: './event-guest-permissions.component.html',
  styleUrls: ['./event-guest-permissions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EventGuestPermissionsComponent),
      multi: true,
    },
  ],
})
export class EventGuestPermissionsComponent implements ControlValueAccessor {
  protected permissions = signal<EventGuestPermissions>({ ...DEFAULT_GUEST_PERMISSIONS });
  protected isDisabled = signal(false);

  private onChange: (value: EventGuestPermissions) => void = () => { /* noop */ };
  private onTouched: () => void = () => { /* noop */ };

  // ControlValueAccessor

  writeValue(value: EventGuestPermissions | null): void {
    this.permissions.set(value ?? { ...DEFAULT_GUEST_PERMISSIONS });
  }

  registerOnChange(fn: (value: EventGuestPermissions) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  // Handlers

  onGuestsCanModifyChange(checked: boolean): void {
    const updated = { ...this.permissions(), guestsCanModify: checked };
    this.permissions.set(updated);
    this.onChange(updated);
    this.onTouched();
  }

  onGuestsCanInviteOthersChange(checked: boolean): void {
    const updated = { ...this.permissions(), guestsCanInviteOthers: checked };
    this.permissions.set(updated);
    this.onChange(updated);
    this.onTouched();
  }

  onGuestsCanSeeOtherGuestsChange(checked: boolean): void {
    const updated = { ...this.permissions(), guestsCanSeeOtherGuests: checked };
    this.permissions.set(updated);
    this.onChange(updated);
    this.onTouched();
  }
}
