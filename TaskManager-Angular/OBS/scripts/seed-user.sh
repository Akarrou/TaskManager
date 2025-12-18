#!/bin/bash

# ===================================================================
# TaskManager - Seed Default User Script
# ===================================================================
# Creates the default admin user after Supabase stack is fully started
# Usage: ./seed-user.sh
# ===================================================================

set -e

echo "👤 TaskManager - Seed Default User"
echo "==================================="
echo ""

# Configuration
DB_CONTAINER="supabase-db"
DEFAULT_EMAIL="valettejerome31@gmail.com"
DEFAULT_PASSWORD="Hyna.321"
DEFAULT_NAME="Jérôme Valette"

# Check if container is running
echo "🔍 Checking database container..."
if ! docker ps | grep -q "$DB_CONTAINER"; then
    echo "❌ Error: Database container '$DB_CONTAINER' is not running"
    echo "   Start the stack first with: docker compose up -d"
    exit 1
fi

# Wait for auth schema to be ready
echo "⏳ Waiting for auth schema to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker exec $DB_CONTAINER psql -U postgres -t -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users';" 2>/dev/null | grep -q "1"; then
        echo "✅ Auth schema is ready"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "   Attempt $ATTEMPT/$MAX_ATTEMPTS - waiting..."
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "❌ Error: Auth schema not available after $MAX_ATTEMPTS attempts"
    exit 1
fi

# Check if user already exists
echo "🔍 Checking if user already exists..."
USER_EXISTS=$(docker exec $DB_CONTAINER psql -U postgres -t -c "SELECT COUNT(*) FROM auth.users WHERE email = '$DEFAULT_EMAIL';" | tr -d ' ')

if [ "$USER_EXISTS" -gt "0" ]; then
    echo "✅ User '$DEFAULT_EMAIL' already exists"
    exit 0
fi

# Create the user
echo "📝 Creating default user..."
docker exec $DB_CONTAINER psql -U postgres -c "
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  email_change,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  email_change_confirm_status,
  is_sso_user,
  is_anonymous
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  '$DEFAULT_EMAIL',
  crypt('$DEFAULT_PASSWORD', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{\"provider\": \"email\", \"providers\": [\"email\"]}',
  '{\"full_name\": \"$DEFAULT_NAME\"}',
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  0,
  false,
  false
);"

echo ""
echo "✅ Default user created successfully!"
echo ""
echo "📋 User Details:"
echo "   Email: $DEFAULT_EMAIL"
echo "   Name:  $DEFAULT_NAME"
echo ""
