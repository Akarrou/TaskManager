#!/usr/bin/env node

/**
 * Script de migration du Storage Supabase Cloud → Self-Hosted
 *
 * Ce script :
 * - Liste tous les fichiers du bucket 'task-attachments' sur Supabase Cloud
 * - Télécharge chaque fichier
 * - Upload vers l'instance Supabase Self-Hosted
 *
 * Prérequis:
 *   npm install @supabase/supabase-js
 *
 * Configuration:
 *   Modifier les valeurs OLD_* et NEW_* ci-dessous
 *
 * Usage:
 *   node migrate-storage.js
 */

const { createClient } = require('@supabase/supabase-js');

// ============================================
// CONFIGURATION À MODIFIER
// ============================================

// Supabase Cloud (ANCIEN)
const OLD_URL = 'https://eoejjfztgdpdciqlvnte.supabase.co';
const OLD_KEY = 'VOTRE_ANCIENNE_ANON_KEY'; // Récupérer depuis Supabase Cloud

// Supabase Self-Hosted (NOUVEAU)
const NEW_URL = 'http://localhost:8000';
const NEW_KEY = 'VOTRE_NOUVELLE_ANON_KEY'; // Généré avec generate-keys.js

// Nom du bucket
const BUCKET_NAME = 'task-attachments';

// ============================================
// CODE
// ============================================

console.log('='.repeat(70));
console.log('📦 Migration du Storage Supabase');
console.log('='.repeat(70));
console.log('');

// Créer clients Supabase
const oldClient = createClient(OLD_URL, OLD_KEY);
const newClient = createClient(NEW_URL, NEW_KEY);

async function migrateStorage() {
  try {
    console.log(`1️⃣  Connexion à Supabase Cloud : ${OLD_URL}`);
    console.log(`2️⃣  Connexion à Supabase Self-Hosted : ${NEW_URL}`);
    console.log('');

    // Créer le bucket s'il n'existe pas encore
    console.log(`3️⃣  Création du bucket '${BUCKET_NAME}' (si nécessaire)...`);
    const { error: bucketError } = await newClient.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });

    if (bucketError && bucketError.message !== 'The resource already exists') {
      console.error('❌ Erreur création bucket:', bucketError);
      // Continue quand même si le bucket existe déjà
    } else {
      console.log('✅ Bucket prêt');
    }
    console.log('');

    // Lister tous les fichiers
    console.log(`4️⃣  Liste des fichiers dans '${BUCKET_NAME}'...`);
    const { data: files, error: listError } = await oldClient
      .storage
      .from(BUCKET_NAME)
      .list();

    if (listError) {
      throw new Error(`Erreur lors de la liste des fichiers: ${listError.message}`);
    }

    if (!files || files.length === 0) {
      console.log('ℹ️  Aucun fichier à migrer.');
      return;
    }

    console.log(`✅ ${files.length} fichier(s) trouvé(s)`);
    console.log('');

    // Migrer chaque fichier
    console.log('5️⃣  Migration des fichiers...');
    console.log('-'.repeat(70));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name;

      try {
        console.log(`[${i + 1}/${files.length}] Migration: ${fileName}`);

        // Télécharger depuis Cloud
        const { data: blob, error: downloadError } = await oldClient
          .storage
          .from(BUCKET_NAME)
          .download(fileName);

        if (downloadError) {
          throw new Error(`Download error: ${downloadError.message}`);
        }

        // Upload vers Self-Hosted
        const { error: uploadError } = await newClient
          .storage
          .from(BUCKET_NAME)
          .upload(fileName, blob, {
            cacheControl: '3600',
            upsert: true, // Écraser si existe déjà
          });

        if (uploadError) {
          throw new Error(`Upload error: ${uploadError.message}`);
        }

        console.log(`   ✅ Migré avec succès`);
        successCount++;
      } catch (err) {
        console.error(`   ❌ Erreur: ${err.message}`);
        errorCount++;
      }
    }

    console.log('-'.repeat(70));
    console.log('');
    console.log('='.repeat(70));
    console.log('📊 Résultat de la migration:');
    console.log('='.repeat(70));
    console.log(`✅ Succès : ${successCount} fichier(s)`);
    console.log(`❌ Erreurs : ${errorCount} fichier(s)`);
    console.log('='.repeat(70));
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('❌ ERREUR CRITIQUE:');
    console.error('='.repeat(70));
    console.error(error.message);
    console.error('');
    console.error('Vérifiez:');
    console.error('  - Les URLs Supabase sont correctes');
    console.error('  - Les clés API sont valides');
    console.error('  - Le bucket existe sur les deux instances');
    console.error('  - Votre connexion internet est active');
    console.error('='.repeat(70));
    process.exit(1);
  }
}

// Exécuter
migrateStorage();
