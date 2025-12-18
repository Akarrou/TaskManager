# Navigation FAB - Guide d'utilisation

Le composant `NavigationFabComponent` est un FAB (Floating Action Button) intelligent et réutilisable qui s'adapte automatiquement au contexte de la page.

## 🚀 Installation et import

```typescript
import { NavigationFabComponent, NavigationAction, NavigationContext } from './shared/components/navigation-fab/navigation-fab.component';
import { NavigationFabService } from './shared/components/navigation-fab/navigation-fab.service';

@Component({
  imports: [NavigationFabComponent],
  // ...
})
```

## 📝 Utilisation de base

### 1. Utilisation simple avec actions par défaut

```html
<app-navigation-fab></app-navigation-fab>
```

### 2. Avec contexte personnalisé

```typescript
export class MyComponent {
  private navFabService = inject(NavigationFabService);

  navigationContext = signal<NavigationContext>({
    isDirty: false,
    hasUnsavedChanges: false,
    canNavigateAway: true,
    currentPage: 'dashboard'
  });
}
```

```html
<app-navigation-fab
  [context]="navigationContext()"
  (actionClicked)="onNavigationAction($event)">
</app-navigation-fab>
```

### 3. Avec actions personnalisées

```typescript
export class MyComponent {
  customActions = signal<NavigationAction[]>([
    {
      id: 'export',
      icon: 'download',
      label: 'Exporter',
      tooltip: 'Exporter les données',
      action: () => this.exportData(),
      color: 'accent'
    },
    {
      id: 'print',
      icon: 'print',
      label: 'Imprimer',
      tooltip: 'Imprimer la page',
      action: () => window.print(),
      color: 'primary'
    }
  ]);

  onNavigationAction(actionId: string) {
    console.log('Action cliquée:', actionId);
  }
}
```

```html
<app-navigation-fab
  [customActions]="customActions()"
  [position]="'bottom-left'"
  [size]="'large'"
  (actionClicked)="onNavigationAction($event)">
</app-navigation-fab>
```

## 🎛️ Configuration avancée

### Options de positionnement
- `position`: `'bottom-right'` | `'bottom-left'` | `'top-right'` | `'top-left'`
- `size`: `'small'` | `'medium'` | `'large'`

### Gestion des formulaires avec changements non sauvés

```typescript
export class FormComponent {
  private formBuilder = inject(FormBuilder);
  private navFabService = inject(NavigationFabService);

  myForm = this.formBuilder.group({
    // ... vos champs
  });

  navigationContext = computed(() => this.navFabService.createContext({
    isDirty: this.myForm.dirty,
    hasUnsavedChanges: this.myForm.dirty,
    canNavigateAway: true,
    currentPage: 'form-edit'
  }));

  customActions = computed(() => this.navFabService.getFormActions({
    onSave: () => this.saveForm(),
    onCancel: () => this.cancelChanges(),
    onReset: () => this.resetForm()
  }));

  onSaveRequested() {
    this.saveForm();
  }

  onNavigateRequested(route: string) {
    if (this.myForm.dirty) {
      const confirmLeave = confirm('Voulez-vous sauvegarder avant de quitter ?');
      if (confirmLeave) {
        this.saveForm().then(() => {
          this.router.navigate([route]);
        });
      }
    } else {
      this.router.navigate([route]);
    }
  }
}
```

```html
<app-navigation-fab
  [context]="navigationContext()"
  [customActions]="customActions()"
  (saveRequested)="onSaveRequested()"
  (navigateRequested)="onNavigateRequested($event)">
</app-navigation-fab>
```

## 🎨 Personnalisation des actions

### Couleurs disponibles
- `'primary'`: Bleu principal
- `'secondary'`: Gris secondaire  
- `'accent'`: Couleur d'accent
- `'warn'`: Rouge d'avertissement

### Structure d'une action

```typescript
interface NavigationAction {
  id: string;              // Identifiant unique
  icon: string;           // Nom de l'icône Material
  label: string;          // Libellé de l'action
  tooltip: string;        // Texte du tooltip
  action: () => void;     // Fonction à exécuter
  visible?: boolean;      // Visibilité (défaut: true)
  color?: string;         // Couleur du bouton
  disabled?: boolean;     // État désactivé
}
```

## 🔄 Utilisation avec le service helper

```typescript
export class DashboardComponent {
  private navFabService = inject(NavigationFabService);

  // Actions communes pour le dashboard
  customActions = signal(this.navFabService.getCommonActions('dashboard'));

  // Context simple
  navigationContext = signal(this.navFabService.createContext({
    currentPage: 'dashboard'
  }));
}
```

## 📱 Responsive et accessibilité

Le composant est entièrement responsive et inclut :
- Adaptation automatique des tailles sur mobile/tablet
- Support des tooltips
- Labels ARIA appropriés
- Navigation au clavier
- Animations fluides

## ⚡ Performance

- Utilise les signals Angular pour la réactivité
- TrackBy optimisé pour les listes d'actions
- Animations CSS performantes
- Lazy loading des actions

## 🎯 Exemples par page

### Dashboard
```typescript
customActions = signal([
  {
    id: 'analytics',
    icon: 'analytics',
    label: 'Analytics',
    tooltip: 'Voir les statistiques',
    action: () => this.router.navigate(['/analytics']),
    color: 'primary'
  }
]);
```

### Liste de tâches
```typescript
customActions = signal([
  {
    id: 'filter',
    icon: 'filter_list',
    label: 'Filtres',
    tooltip: 'Ouvrir les filtres',
    action: () => this.toggleFilters(),
    color: 'accent'
  },
  {
    id: 'bulk-actions',
    icon: 'checklist',
    label: 'Actions groupées',
    tooltip: 'Actions sur plusieurs tâches',
    action: () => this.openBulkActions(),
    color: 'secondary'
  }
]);
```

### Page de détail
```typescript
customActions = signal([
  {
    id: 'edit',
    icon: 'edit',
    label: 'Modifier',
    tooltip: 'Modifier cet élément',
    action: () => this.editItem(),
    color: 'primary'
  },
  {
    id: 'share',
    icon: 'share',
    label: 'Partager',
    tooltip: 'Partager cet élément',
    action: () => this.shareItem(),
    color: 'accent'
  }
]);
```