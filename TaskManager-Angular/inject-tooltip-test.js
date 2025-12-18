// Script pour tester les tooltips
console.log('🔍 Test des tooltips - début');

// Attendre que la page soit complètement chargée
setTimeout(() => {
  // 1. Chercher tous les éléments avec tooltip
  const elementsWithTooltip = document.querySelectorAll('[mattooltip], [mat-tooltip]');
  console.log('🎯 Éléments avec tooltip trouvés:', elementsWithTooltip.length);

  if (elementsWithTooltip.length > 0) {
    const firstElement = elementsWithTooltip[0];
    console.log('📍 Premier élément avec tooltip:', firstElement);
    
    // 2. Déclencher mouseenter sur le premier élément
    const mouseEnterEvent = new MouseEvent('mouseenter', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: 100,
      clientY: 100
    });
    
    firstElement.dispatchEvent(mouseEnterEvent);
    console.log('🖱️ Événement mouseenter déclenché');
    
    // 3. Vérifier après un délai si des tooltips sont apparus
    setTimeout(() => {
      const tooltips = document.querySelectorAll('.mat-mdc-tooltip, .mdc-tooltip, [role="tooltip"]');
      console.log('💬 Tooltips trouvés dans le DOM:', tooltips.length);
      
      tooltips.forEach((tooltip, index) => {
        const computedStyle = window.getComputedStyle(tooltip);
        console.log(`🎨 Tooltip ${index}:`, {
          element: tooltip,
          className: tooltip.className,
          background: computedStyle.backgroundColor,
          color: computedStyle.color,
          opacity: computedStyle.opacity,
          zIndex: computedStyle.zIndex,
          display: computedStyle.display,
          visibility: computedStyle.visibility
        });
      });
    }, 1000);
  }
}, 1000);
