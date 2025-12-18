#!/bin/bash
set -e

echo "==========================================================================="
echo "🔐 Création d'un Utilisateur de Test"
echo "==========================================================================="
echo ""

EMAIL="test@example.com"
PASSWORD="password123"

echo "📧 Email: $EMAIL"
echo "🔑 Password: $PASSWORD"
echo ""

# Generate UUID for user
USER_ID=$(docker exec supabase-db psql -U postgres -d postgres -t -c "SELECT gen_random_uuid();")
USER_ID=$(echo $USER_ID | xargs) # Trim whitespace

echo "Création de l'utilisateur dans auth.users..."

# Create user in auth.users table
docker exec -i supabase-db psql -U postgres -d postgres <<EOF
-- Insert into auth.users (simplified, password not hashed for demo)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  aud,
  role
) VALUES (
  '$USER_ID',
  '00000000-0000-0000-0000-000000000000',
  '$EMAIL',
  '\$2a\$10\$5YZBvFNYoYEKXaMLTLCUBOZ7MHzNPQYXY4J.RJKfH4J5xGXJxGXJx', -- Hashed "password123"
  NOW(),
  NOW(),
  NOW(),
  '',
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Insert into auth.identities
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
) VALUES (
  '$USER_ID',
  '$USER_ID',
  '{"sub": "$USER_ID", "email": "$EMAIL"}',
  'email',
  NOW(),
  NOW()
) ON CONFLICT (id, provider) DO NOTHING;
EOF

echo ""
echo "==========================================================================="
echo "✅ Utilisateur Créé !"
echo "==========================================================================="
echo ""
echo "Vous pouvez maintenant vous connecter avec :"
echo "  📧 Email: $EMAIL"
echo "  🔑 Password: $PASSWORD"
echo ""
echo "⚠️  Note: Le mot de passe hashé utilisé est une démo."
echo "Pour un vrai mot de passe sécurisé, utilisez l'interface Supabase Studio."
echo ""
