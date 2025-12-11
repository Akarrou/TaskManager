#!/usr/bin/env node

/**
 * Script de génération des clés JWT pour Supabase Self-Hosted
 *
 * Ce script génère :
 * - JWT_SECRET : Secret pour signer les tokens
 * - ANON_KEY : Clé anonyme pour accès public
 * - SERVICE_ROLE_KEY : Clé pour opérations administratives
 *
 * Usage:
 *   1. Installer dépendances : npm install jsonwebtoken
 *   2. Exécuter : node generate-keys.js
 *   3. Copier les valeurs dans le fichier .env
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

console.log('='.repeat(70));
console.log('🔐 Génération des clés JWT pour Supabase Self-Hosted');
console.log('='.repeat(70));
console.log('');

// Générer JWT_SECRET (32 bytes = 64 caractères hex)
const jwtSecret = crypto.randomBytes(32).toString('hex');

console.log('1️⃣  JWT_SECRET (à copier dans .env):');
console.log('-'.repeat(70));
console.log(jwtSecret);
console.log('');

// Générer ANON_KEY (token JWT avec role 'anon', expiration 10 ans)
const anonKey = jwt.sign(
  {
    role: 'anon',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
  },
  jwtSecret,
  { expiresIn: '10y' }
);

console.log('2️⃣  ANON_KEY (à copier dans .env):');
console.log('-'.repeat(70));
console.log(anonKey);
console.log('');

// Générer SERVICE_ROLE_KEY (token JWT avec role 'service_role', expiration 10 ans)
const serviceRoleKey = jwt.sign(
  {
    role: 'service_role',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
  },
  jwtSecret,
  { expiresIn: '10y' }
);

console.log('3️⃣  SERVICE_ROLE_KEY (à copier dans .env):');
console.log('-'.repeat(70));
console.log(serviceRoleKey);
console.log('');

console.log('='.repeat(70));
console.log('✅ Clés générées avec succès !');
console.log('');
console.log('⚠️  IMPORTANT :');
console.log('   - Copiez ces valeurs dans votre fichier .env');
console.log('   - Ne partagez JAMAIS ces clés');
console.log('   - Ne commitez JAMAIS le fichier .env dans Git');
console.log('   - Utilisez ces mêmes clés dans environment.ts (ANON_KEY)');
console.log('='.repeat(70));
