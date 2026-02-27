import { Component, inject } from '@angular/core';
import { LogoComponent } from '../../../../shared/components/logo/logo.component';
import { OnboardingCreateFormComponent } from '../onboarding-create-form/onboarding-create-form.component';
import { OnboardingStore } from '../../store/onboarding.store';

@Component({
  selector: 'app-onboarding-page',
  standalone: true,
  imports: [LogoComponent, OnboardingCreateFormComponent],
  providers: [OnboardingStore],
  templateUrl: './onboarding-page.component.html',
  styleUrls: ['./onboarding-page.component.scss'],
})
export class OnboardingPageComponent {
  protected store = inject(OnboardingStore);

  onCreateDemo(): void {
    this.store.createDemoProject();
  }

  onShowCreateForm(): void {
    this.store.setStep('create-form');
  }

  onBackToWelcome(): void {
    this.store.setStep('welcome');
    this.store.resetError();
  }

  onCreateCustomProject(data: { name: string; description: string }): void {
    this.store.createCustomProject(data);
  }
}
