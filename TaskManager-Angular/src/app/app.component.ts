import { Component, OnInit, HostListener, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { HeaderNavComponent } from './shared/components/header-nav/header-nav.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { NavigationFabComponent } from './shared/components/navigation-fab/navigation-fab.component';
import { Footer } from './shared/components/footer/footer';
import { ProjectStore } from './features/projects/store/project.store';
import { FabStore } from './core/stores/fab.store';
import { GlobalSearchDialogComponent } from './shared/components/global-search-dialog/global-search-dialog.component';

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

  private projectStore = inject(ProjectStore);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  protected readonly fabStore = inject(FabStore);

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      if (!this.dialog.openDialogs.length) {
        this.dialog.open(GlobalSearchDialogComponent, {
          width: '640px',
          maxWidth: '90vw',
          position: { top: '15vh' },
          autoFocus: false,
          hasBackdrop: true,
          panelClass: 'spotlight-dialog-panel',
        });
      }
    }
  }

  ngOnInit(): void {
    this.projectStore.loadProjects();
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
