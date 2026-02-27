import { Injectable, inject } from '@angular/core';
import { Observable, concatMap, map, Subject, from, of, defer, timer, throwError } from 'rxjs';
import { switchMap, catchError, retryWhen, mergeMap, take } from 'rxjs/operators';
import { ProjectService } from '../../projects/services/project.service';
import { DocumentService } from '../../documents/services/document.service';
import { DatabaseService } from '../../documents/services/database.service';
import { SupabaseService } from '../../../core/services/supabase';
import {
  createTaskDatabaseConfig,
  createEventDatabaseConfig,
  CreateDatabaseResponse,
  DatabaseColumn,
  CellValue,
} from '../../documents/models/database.model';

export interface SeedProgress {
  message: string;
  step: number;
  totalSteps: number;
}

@Injectable({ providedIn: 'root' })
export class DemoSeedService {
  private projectService = inject(ProjectService);
  private documentService = inject(DocumentService);
  private databaseService = inject(DatabaseService);
  private supabase = inject(SupabaseService);

  private progress$$ = new Subject<SeedProgress>();
  readonly progress$ = this.progress$$.asObservable();

  private emitProgress(message: string, step: number, totalSteps: number): void {
    this.progress$$.next({ message, step, totalSteps });
  }

  seedDemoProject(): Observable<{ projectId: string }> {
    const totalSteps = 6;
    let projectId: string;
    let taskDbId: string;
    let taskColumns: DatabaseColumn[];
    let eventDbId: string;
    let eventColumns: DatabaseColumn[];

    // Step 1: Create project
    this.emitProgress('Création du projet...', 1, totalSteps);

    return this.projectService.createProject({
      name: 'Projet Démo',
      description: 'Projet de démonstration pour découvrir Kōdo. Explorez les tâches, documents et événements.',
    }).pipe(
      // Step 2: Create welcome document
      concatMap(project => {
        projectId = project.id;
        this.emitProgress('Ajout du document de bienvenue...', 2, totalSteps);

        return this.documentService.createDocument({
          title: 'Notes de bienvenue',
          project_id: projectId,
          content: this.buildWelcomeContent(),
        });
      }),

      // Step 3: Create task database
      concatMap(() => {
        this.emitProgress('Création de la base de tâches...', 3, totalSteps);

        return this.documentService.createDocument({
          title: 'Suivi des tâches',
          project_id: projectId,
        }).pipe(
          concatMap(doc => {
            const config = createTaskDatabaseConfig('Tâches du projet');
            taskColumns = config.columns;
            return this.databaseService.createDatabase({ documentId: doc.id, config }).pipe(
              concatMap(res => this.waitForTableInSchema(res).pipe(map(() => res))),
            );
          }),
          map(res => { taskDbId = res.databaseId; return res; }),
        );
      }),

      // Step 4: Seed task rows
      concatMap(() => {
        this.emitProgress('Ajout des tâches...', 4, totalSteps);
        return this.seedTaskRows(taskDbId, taskColumns, projectId);
      }),

      // Step 5: Create event database
      concatMap(() => {
        this.emitProgress('Création du calendrier...', 5, totalSteps);

        return this.documentService.createDocument({
          title: 'Planning',
          project_id: projectId,
        }).pipe(
          concatMap(doc => {
            const config = createEventDatabaseConfig('Planning');
            eventColumns = config.columns;
            return this.databaseService.createDatabase({ documentId: doc.id, config }).pipe(
              concatMap(res => this.waitForTableInSchema(res).pipe(map(() => res))),
            );
          }),
          map(res => { eventDbId = res.databaseId; return res; }),
        );
      }),

      // Step 6: Seed event rows
      concatMap(() => {
        this.emitProgress('Ajout des événements...', 6, totalSteps);
        return this.seedEventRows(eventDbId, eventColumns, projectId);
      }),

      map(() => ({ projectId })),
    );
  }

  private seedTaskRows(databaseId: string, columns: DatabaseColumn[], projectId: string): Observable<unknown> {
    const col = (name: string): string => columns.find(c => c.name === name)!.id;

    const tasks: Record<string, CellValue>[] = [
      {
        [col('Title')]: 'Configurer l\'environnement',
        [col('Status')]: 'completed',
        [col('Priority')]: 'high',
        [col('Type')]: 'task',
      },
      {
        [col('Title')]: 'Définir l\'architecture',
        [col('Status')]: 'in_progress',
        [col('Priority')]: 'high',
        [col('Type')]: 'feature',
      },
      {
        [col('Title')]: 'Créer la page d\'accueil',
        [col('Status')]: 'pending',
        [col('Priority')]: 'medium',
        [col('Type')]: 'task',
      },
      {
        [col('Title')]: 'Intégrer les tests unitaires',
        [col('Status')]: 'backlog',
        [col('Priority')]: 'low',
        [col('Type')]: 'task',
      },
      {
        [col('Title')]: 'Déployer en production',
        [col('Status')]: 'backlog',
        [col('Priority')]: 'critical',
        [col('Type')]: 'epic',
      },
    ];

    // Chain concatMap to create rows sequentially
    let chain$: Observable<unknown> = this.databaseService.addRowWithDocument(databaseId, tasks[0], projectId);
    for (let i = 1; i < tasks.length; i++) {
      chain$ = chain$.pipe(
        concatMap(() => this.databaseService.addRowWithDocument(databaseId, tasks[i], projectId))
      );
    }
    return chain$;
  }

  private seedEventRows(databaseId: string, columns: DatabaseColumn[], projectId: string): Observable<unknown> {
    const col = (name: string): string => columns.find(c => c.name === name)!.id;

    const now = new Date();

    // Meeting: today + 2 days, 10h-11h
    const meetingStart = new Date(now);
    meetingStart.setDate(meetingStart.getDate() + 2);
    meetingStart.setHours(10, 0, 0, 0);
    const meetingEnd = new Date(meetingStart);
    meetingEnd.setHours(11, 0, 0, 0);

    // Deadline: today + 14 days, all day
    const deadlineStart = new Date(now);
    deadlineStart.setDate(deadlineStart.getDate() + 14);
    deadlineStart.setHours(0, 0, 0, 0);
    const deadlineEnd = new Date(deadlineStart);
    deadlineEnd.setHours(23, 59, 59, 0);

    // Demo: today + 30 days, 14h-15h
    const demoStart = new Date(now);
    demoStart.setDate(demoStart.getDate() + 30);
    demoStart.setHours(14, 0, 0, 0);
    const demoEnd = new Date(demoStart);
    demoEnd.setHours(15, 0, 0, 0);

    const events: Record<string, CellValue>[] = [
      {
        [col('Title')]: 'Réunion de lancement',
        [col('Category')]: 'meeting',
        [col('Start Date')]: meetingStart.toISOString(),
        [col('End Date')]: meetingEnd.toISOString(),
        [col('All Day')]: false,
      },
      {
        [col('Title')]: 'Livraison Sprint 1',
        [col('Category')]: 'deadline',
        [col('Start Date')]: deadlineStart.toISOString(),
        [col('End Date')]: deadlineEnd.toISOString(),
        [col('All Day')]: true,
      },
      {
        [col('Title')]: 'Démo client',
        [col('Category')]: 'milestone',
        [col('Start Date')]: demoStart.toISOString(),
        [col('End Date')]: demoEnd.toISOString(),
        [col('All Day')]: false,
      },
    ];

    let chain$: Observable<unknown> = this.databaseService.addRowWithDocument(databaseId, events[0], projectId);
    for (let i = 1; i < events.length; i++) {
      chain$ = chain$.pipe(
        concatMap(() => this.databaseService.addRowWithDocument(databaseId, events[i], projectId))
      );
    }
    return chain$;
  }

  /**
   * Wait for PostgREST to see a newly created database table in its schema cache.
   * Reloads the schema cache and retries until the table is queryable.
   */
  private waitForTableInSchema(dbResponse: CreateDatabaseResponse): Observable<boolean> {
    const maxRetries = 15;
    const retryDelay = 300;
    const tableName = `database_${dbResponse.databaseId.replace(/-/g, '_')}`;

    return defer(() =>
      // Reload schema cache first
      from(this.supabase.client.rpc('reload_schema_cache')).pipe(
        catchError(() => of(null)),
        switchMap(() =>
          // Try a SELECT on the table — 404/PGRST204 means not cached yet
          from(this.supabase.client.from(tableName).select('id').limit(0)).pipe(
            switchMap(({ error }) => {
              if (error) {
                return throwError(() => new Error('Table not in schema cache yet'));
              }
              return of(true);
            }),
          )
        ),
      )
    ).pipe(
      retryWhen(errors =>
        errors.pipe(
          mergeMap((_err, index) => {
            if (index >= maxRetries) {
              return of(true);
            }
            return timer(retryDelay);
          }),
        )
      ),
      take(1),
    );
  }

  private buildWelcomeContent(): Record<string, unknown> {
    return {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Bienvenue sur Kōdo !' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Ce projet de démonstration vous permet de découvrir les fonctionnalités de Kōdo. Voici ce que vous pouvez explorer :',
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Tâches' },
                  { type: 'text', text: ' — Gérez vos tâches avec des vues tableau et Kanban' },
                ],
              }],
            },
            {
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Documents' },
                  { type: 'text', text: ' — Créez des notes riches avec l\'éditeur TipTap' },
                ],
              }],
            },
            {
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'bold' }], text: 'Calendrier' },
                  { type: 'text', text: ' — Planifiez vos événements et jalons' },
                ],
              }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'N\'hésitez pas à modifier ce document ou à en créer de nouveaux. Bonne découverte !',
            },
          ],
        },
      ],
    };
  }
}
