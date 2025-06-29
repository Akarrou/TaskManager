// Injection JavaScript pour tester les tooltips
const taskBadges = document.querySelectorAll('.task-badge');
console.log('Task badges trouvés:', taskBadges.length);

if (taskBadges.length > 0) {
  // Déclencher manuellement le tooltip du premier badge
  const firstBadge = taskBadges[0];
  console.log('Premier badge:', firstBadge);
  
  // Simuler un hover sur le premier task badge
  const hoverEvent = new MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  
  firstBadge.dispatchEvent(hoverEvent);
  
  // Vérifier les tooltips présents dans le DOM
  setTimeout(() => {
    const tooltips = document.querySelectorAll('.mat-mdc-tooltip, .mdc-tooltip, [role="tooltip"]');
    console.log('Tooltips trouvés:', tooltips.length);
    tooltips.forEach((tooltip, index) => {
      console.log(`Tooltip ${index}:`, tooltip);
      console.log(`Styles appliqués:`, getComputedStyle(tooltip));
    });
  }, 500);
}
