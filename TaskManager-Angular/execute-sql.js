#!/usr/bin/env node

/**
 * Script d'exécution SQL sur Supabase
 * Usage: node execute-sql.js
 */

const fs = require('fs');
const https = require('https');

// Configuration Supabase
const SUPABASE_URL = 'https://eoejjfztgdpdciqlvnte.supabase.co';

// IMPORTANT: Vous devez fournir votre Service Role Key
// Trouvez-la ici: https://supabase.com/dashboard/project/eoejjfztgdpdciqlvnte/settings/api
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Erreur: Variable d\'environnement SUPABASE_SERVICE_KEY manquante');
  console.error('');
  console.error('🔑 Pour obtenir votre Service Role Key:');
  console.error('   1. Allez sur: https://supabase.com/dashboard/project/eoejjfztgdpdciqlvnte/settings/api');
  console.error('   2. Copiez la "service_role" key (section "Project API keys")');
  console.error('   3. Exécutez:');
  console.error('      export SUPABASE_SERVICE_KEY="votre_key_ici"');
  console.error('      node execute-sql.js');
  console.error('');
  process.exit(1);
}

console.log('🚀 Exécution du script SQL sur Supabase...\n');

// Lire le fichier SQL
const sqlContent = fs.readFileSync('./SIMPLE_SETUP.sql', 'utf8');

// Découper en instructions individuelles
const statements = sqlContent
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`📝 ${statements.length} instructions SQL à exécuter\n`);

// Fonction pour exécuter une requête SQL via l'API Supabase
async function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });

    const options = {
      hostname: SUPABASE_URL.replace('https://', ''),
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ success: true, data: responseData });
        } else {
          resolve({ success: false, error: responseData, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Alternative: Exécution via psql (si disponible)
const { execSync } = require('child_process');

function executeViaPsql() {
  console.log('🔧 Tentative d\'exécution via psql...\n');

  // Construire l'URL de connexion PostgreSQL
  // Format: postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres

  console.log('❌ Méthode psql nécessite le mot de passe de la base de données');
  console.log('📍 Utilisez plutôt la méthode manuelle dans Supabase Dashboard\n');

  return false;
}

// Méthode principale: Créer un fichier de migration
function createMigrationFile() {
  console.log('📦 Création d\'un fichier de migration...\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const migrationPath = `./supabase/migrations/${timestamp}_create_database_tables.sql`;

  // Créer le dossier si nécessaire
  const dir = './supabase/migrations';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Copier le fichier SQL
  fs.copyFileSync('./SIMPLE_SETUP.sql', migrationPath);

  console.log(`✅ Fichier de migration créé: ${migrationPath}`);
  console.log('');
  console.log('🎯 Prochaines étapes:');
  console.log('   1. Si vous utilisez Supabase CLI:');
  console.log('      supabase db push');
  console.log('');
  console.log('   2. Sinon, copiez le contenu de SIMPLE_SETUP.sql');
  console.log('      et collez-le dans Supabase SQL Editor:');
  console.log('      https://supabase.com/dashboard/project/eoejjfztgdpdciqlvnte/sql/new');
  console.log('');
}

// Exécution
console.log('⚠️  Note: L\'API REST Supabase ne permet pas d\'exécuter du SQL arbitraire');
console.log('    pour des raisons de sécurité.\n');
console.log('📋 Méthode recommandée: Copier-coller manuel\n');

createMigrationFile();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('✋ ACTION REQUISE:');
console.log('');
console.log('1. Copiez le contenu de SIMPLE_SETUP.sql');
console.log('2. Ouvrez: https://supabase.com/dashboard/project/eoejjfztgdpdciqlvnte/sql/new');
console.log('3. Collez et cliquez sur "RUN"');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
