-- Migration: Create default admin user
-- Description: Creates the default user for production deployment
-- This uses Supabase's auth.users table structure properly

DO $$
BEGIN
  -- Only insert if user doesn't exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'valettejerome31@gmail.com') THEN
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
      'valettejerome31@gmail.com',
      crypt('Hyna.321', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{}',
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
    );
    RAISE NOTICE 'Default user created: valettejerome31@gmail.com';
  ELSE
    RAISE NOTICE 'Default user already exists';
  END IF;
END $$;
