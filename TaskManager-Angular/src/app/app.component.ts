import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderNavComponent } from './shared/components/header-nav/header-nav.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { NavigationFabComponent } from './shared/components/navigation-fab/navigation-fab.component';
import { Footer } from './shared/components/footer/footer';
import { Store } from '@ngrx/store';
import { AppState } from './app.state';
import * as ProjectActions from './features/projects/store/project.actions';
import { FabStore } from './core/stores/fab.store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, HeaderNavComponent, ToastComponent, NavigationFabComponent, Footer],
  template: `
    <div class="app-container">
      <app-header-nav></app-header-nav>
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
      <app-footer></app-footer>
      <app-toast></app-toast>

      <!-- FAB Centralisé -->
      <app-navigation-fab
        [context]="fabStore.context()"
        [customActions]="fabStore.actions()"
        [hidden]="fabStore.hidden()"
        (saveRequested)="handleSaveRequest()"
        (navigateRequested)="handleNavigateRequest($event)">
      </app-navigation-fab>
    </div>
  `,
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'Kōdo';

  private store = inject(Store<AppState>);
  private router = inject(Router);

  protected readonly fabStore = inject(FabStore);

  ngOnInit(): void {
    this.store.dispatch(ProjectActions.loadProjects());
  }

  async handleSaveRequest(): Promise<void> {
    await this.fabStore.executeSave();
  }

  async handleNavigateRequest(route: string): Promise<void> {
    const canNavigate = await this.fabStore.canNavigateAway(route);
    if (canNavigate) {
      this.router.navigate([route]);
    }
  }
}
