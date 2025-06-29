// Injection JavaScript pour diagnostiquer les tooltips
(async () => {
  console.log('🔍 Diagnostic tooltips démarré');
  
  // 1. Chercher les task badges
  const taskBadges = document.querySelectorAll('.task-badge, [class*="task-badge"]');
  console.log('🎯 Task badges trouvés:', taskBadges.length);
  
  if (taskBadges.length > 0) {
    const badge = taskBadges[0];
    console.log('📍 Premier badge:', badge);
    
    // 2. Déclencher mouseenter
    badge.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    
    // 3. Attendre et vérifier les tooltips
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const tooltips = document.querySelectorAll('.mat-mdc-tooltip, .mdc-tooltip, [role="tooltip"]');
    console.log('💬 Tooltips présents:', tooltips.length);
    
    // 4. Injecter des styles de force brute
    const style = document.createElement('style');
    style.textContent = `
      .mat-mdc-tooltip,
      .mdc-tooltip,
      [role="tooltip"] {
        background: #1f2937 !important;
        background-color: #1f2937 !important;
        color: #ffffff !important;
        opacity: 1 !important;
        border-radius: 6px !important;
        padding: 12px !important;
        font-size: 12px !important;
        z-index: 9999 !important;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
      }
      
      .cdk-overlay-container .mat-mdc-tooltip {
        background: #1f2937 !important;
        color: #ffffff !important;
      }
    `;
    document.head.appendChild(style);
    console.log('🎨 Styles forcés injectés');
    
    return 'Diagnostic terminé';
  }
})();
