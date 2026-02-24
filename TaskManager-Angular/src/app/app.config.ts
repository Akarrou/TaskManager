import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, isDevMode, LOCALE_ID } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideNativeDateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';

import { routes } from './app.routes';

registerLocaleData(localeFr);
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { reducers, metaReducers } from './store/reducers';
import { ProjectEffects } from './features/projects/store/project.effects';
import { DocumentEffects } from './features/documents/store/document.effects';
import { RealtimeEffects } from './core/effects/realtime.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'top'
      })
    ),
    provideAnimations(),
    provideStore(reducers, { metaReducers }),
    provideEffects([ProjectEffects, DocumentEffects, RealtimeEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
    { provide: LOCALE_ID, useValue: 'fr-FR' },
  ]
};
