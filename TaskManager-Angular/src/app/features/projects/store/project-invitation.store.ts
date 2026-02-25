import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, switchMap, tap, concatMap } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProjectInvitationService } from '../services/project-invitation.service';
import { ProjectInvitation, CreateInvitationDto } from '../models/project.model';
import { withRealtimeSync } from '../../../core/stores/features/with-realtime-sync';

interface ProjectInvitationStoreState {
  invitations: ProjectInvitation[];
  currentProjectId: string | null;
  loading: boolean;
  processing: boolean;
  error: string | null;
}

export const ProjectInvitationStore = signalStore(
  { providedIn: 'root' },

  withState<ProjectInvitationStoreState>({
    invitations: [],
    currentProjectId: null,
    loading: false,
    processing: false,
    error: null,
  }),

  withMethods((
    store,
    invitationService = inject(ProjectInvitationService),
    snackBar = inject(MatSnackBar),
  ) => ({
    loadInvitations: rxMethod<{ projectId: string }>(
      pipe(
        tap(({ projectId }) => patchState(store, { loading: true, error: null, currentProjectId: projectId })),
        switchMap(({ projectId }) =>
          invitationService.getProjectInvitations(projectId).pipe(
            tapResponse({
              next: (invitations) => {
                patchState(store, { invitations, loading: false });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
                snackBar.open('Erreur lors du chargement des invitations', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    createInvitation: rxMethod<CreateInvitationDto>(
      pipe(
        tap(() => patchState(store, { processing: true, error: null })),
        concatMap((invitationData) =>
          invitationService.createInvitation(invitationData).pipe(
            tapResponse({
              next: (invitation) => {
                patchState(store, {
                  invitations: [invitation, ...store.invitations()],
                  processing: false,
                });
                snackBar.open(`Invitation envoyée à ${invitationData.email}`, 'Fermer', { duration: 3000 });
              },
              error: (error: Error) => {
                patchState(store, { processing: false, error: error.message });
                snackBar.open("Erreur lors de l'envoi de l'invitation", 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    cancelInvitation: rxMethod<{ invitationId: string }>(
      pipe(
        tap(() => patchState(store, { processing: true, error: null })),
        concatMap(({ invitationId }) =>
          invitationService.cancelInvitation(invitationId).pipe(
            tapResponse({
              next: () => {
                patchState(store, {
                  invitations: store.invitations().filter(i => i.id !== invitationId),
                  processing: false,
                });
                snackBar.open('Invitation annulée', 'Fermer', { duration: 2000 });
              },
              error: (error: Error) => {
                patchState(store, { processing: false, error: error.message });
                snackBar.open("Erreur lors de l'annulation", 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    acceptInvitation: rxMethod<{ token: string }>(
      pipe(
        tap(() => patchState(store, { processing: true, error: null })),
        concatMap(({ token }) =>
          invitationService.acceptInvitation(token).pipe(
            tapResponse({
              next: () => {
                patchState(store, { processing: false });
                snackBar.open('Invitation acceptée', 'Fermer', { duration: 3000 });
              },
              error: (error: Error) => {
                patchState(store, { processing: false, error: error.message });
                snackBar.open("Erreur lors de l'acceptation", 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    rejectInvitation: rxMethod<{ token: string }>(
      pipe(
        tap(() => patchState(store, { processing: true, error: null })),
        concatMap(({ token }) =>
          invitationService.rejectInvitation(token).pipe(
            tapResponse({
              next: () => {
                patchState(store, { processing: false });
                snackBar.open('Invitation refusée', 'Fermer', { duration: 3000 });
              },
              error: (error: Error) => {
                patchState(store, { processing: false, error: error.message });
                snackBar.open('Erreur lors du refus', 'Fermer', { duration: 3000 });
              },
            })
          )
        )
      )
    ),

    async copyInvitationLink(token: string): Promise<boolean> {
      const success = await invitationService.copyInvitationLink(token);
      if (success) {
        snackBar.open("Lien d'invitation copié !", 'Fermer', { duration: 2000 });
      } else {
        snackBar.open('Impossible de copier le lien', 'Fermer', { duration: 3000 });
      }
      return success;
    },
  })),

  withRealtimeSync({
    tables: ['project_invitations'],
    onTableChange: (store) => {
      const projectId = store['currentProjectId'];
      const loadFn = store['loadInvitations'];
      if (typeof projectId === 'function' && typeof loadFn === 'function') {
        const id = projectId() as string | null;
        if (id) loadFn({ projectId: id });
      }
    },
  }),
);
