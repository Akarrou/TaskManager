// Script à copier-coller dans la console du navigateur
// pour nettoyer tous les tokens d'authentification

console.log('🧹 Nettoyage des tokens d\'authentification...');

// Lister toutes les clés localStorage
const keys = Object.keys(localStorage);
console.log('Clés localStorage trouvées:', keys);

// Trouver et supprimer toutes les clés Supabase
const supabaseKeys = keys.filter(key => key.includes('supabase') || key.includes('sb-'));
console.log('Clés Supabase à supprimer:', supabaseKeys);

supabaseKeys.forEach(key => {
  console.log('Suppression:', key);
  localStorage.removeItem(key);
});

// Nettoyer sessionStorage aussi
const sessionKeys = Object.keys(sessionStorage);
const supabaseSessionKeys = sessionKeys.filter(key => key.includes('supabase') || key.includes('sb-'));
supabaseSessionKeys.forEach(key => {
  console.log('Suppression (session):', key);
  sessionStorage.removeItem(key);
});

console.log('✅ Nettoyage terminé ! Rechargez la page et reconnectez-vous.');
console.log('');
console.log('Nouvelle URL Supabase: http://localhost:8000');
console.log('Email: valettejerome31@gmail.com');
