import { Component, inject, output } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-onboarding-create-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './onboarding-create-form.component.html',
  styleUrls: ['./onboarding-create-form.component.scss'],
})
export class OnboardingCreateFormComponent {
  private fb = inject(FormBuilder);

  submitted = output<{ name: string; description: string }>();
  cancelled = output<void>();

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
  });

  onSubmit(): void {
    if (this.form.valid) {
      const rawName = this.form.value.name!.trim();
      const capitalizedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      this.submitted.emit({
        name: capitalizedName,
        description: this.form.value.description || '',
      });
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
