import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { tapResponse } from '@ngrx/operators';
import { pipe, switchMap, tap, concatMap } from 'rxjs';
import { ProjectMemberService } from '../services/project-member.service';
import { ProjectMember, CreateProjectMemberDto } from '../models/project.model';
import { withRealtimeSync } from '../../../core/stores/features/with-realtime-sync';

interface ProjectMemberStoreState {
  members: ProjectMember[];
  currentProjectId: string | null;
  isOwner: boolean;
  loading: boolean;
  error: string | null;
}

export const ProjectMemberStore = signalStore(
  { providedIn: 'root' },

  withState<ProjectMemberStoreState>({
    members: [],
    currentProjectId: null,
    isOwner: false,
    loading: false,
    error: null,
  }),

  withComputed((store) => ({
    canManageMembers: computed(() => store.isOwner()),
    memberCount: computed(() => store.members().length),
  })),

  withMethods((
    store,
    memberService = inject(ProjectMemberService),
  ) => ({
    loadMembers: rxMethod<{ projectId: string }>(
      pipe(
        tap(({ projectId }) => patchState(store, { loading: true, error: null, currentProjectId: projectId })),
        switchMap(({ projectId }) =>
          memberService.getProjectMembers(projectId).pipe(
            tapResponse({
              next: (members) => {
                patchState(store, { members, loading: false });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    checkOwnership: rxMethod<{ projectId: string }>(
      pipe(
        switchMap(({ projectId }) =>
          memberService.isProjectOwner(projectId).pipe(
            switchMap(obs => obs),
            tapResponse({
              next: (isOwner) => {
                patchState(store, { isOwner });
              },
              error: (error: Error) => {
                console.error('Error checking ownership:', error);
                patchState(store, { isOwner: false });
              },
            })
          )
        )
      )
    ),

    addMember: rxMethod<CreateProjectMemberDto>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap((memberData) =>
          memberService.addProjectMember(memberData).pipe(
            switchMap(obs => obs),
            switchMap(() => {
              const projectId = store.currentProjectId();
              if (projectId) {
                return memberService.getProjectMembers(projectId);
              }
              return [];
            }),
            tapResponse({
              next: (members) => {
                patchState(store, { members, loading: false });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),

    removeMember: rxMethod<{ memberId: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        concatMap(({ memberId }) =>
          memberService.removeMember(memberId).pipe(
            tapResponse({
              next: () => {
                patchState(store, {
                  members: store.members().filter(m => m.id !== memberId),
                  loading: false,
                });
              },
              error: (error: Error) => {
                patchState(store, { loading: false, error: error.message });
              },
            })
          )
        )
      )
    ),
  })),

  withRealtimeSync({
    tables: ['project_members'],
    onTableChange: (store) => {
      const projectId = store['currentProjectId'];
      const loadMembersFn = store['loadMembers'];
      if (typeof projectId === 'function' && typeof loadMembersFn === 'function') {
        const id = projectId() as string | null;
        if (id) loadMembersFn({ projectId: id });
      }
    },
  }),
);
