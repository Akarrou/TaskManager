import { Injectable, inject } from '@angular/core';
import { createEffect } from '@ngrx/effects';
import { debounceTime, map } from 'rxjs/operators';
import { RealtimeService } from '../services/realtime.service';
import * as ProjectActions from '../../features/projects/store/project.actions';
import * as DocumentActions from '../../features/documents/store/document.actions';

@Injectable()
export class RealtimeEffects {
  private realtimeService = inject(RealtimeService);

  projectsChanged$ = createEffect(() =>
    this.realtimeService.onTableChange('projects').pipe(
      debounceTime(300),
      map(() => ProjectActions.loadProjects()),
    ),
  );

  documentsChanged$ = createEffect(() =>
    this.realtimeService.onTableChange('documents').pipe(
      debounceTime(300),
      map(() => DocumentActions.loadDocuments()),
    ),
  );
}
