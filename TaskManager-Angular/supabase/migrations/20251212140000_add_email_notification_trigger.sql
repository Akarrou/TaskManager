-- Migration: Add Email Notification Trigger
-- Date: 2025-12-12
-- Description: Automatically send email when a new invitation is created

-- Function to call Edge Function for sending invitation email
CREATE OR REPLACE FUNCTION public.notify_invitation_email()
RETURNS trigger AS $$
DECLARE
    project_record record;
    inviter_record record;
    function_url text;
BEGIN
    -- Get project details
    SELECT name INTO project_record FROM public.projects WHERE id = NEW.project_id;

    -- Get inviter details
    SELECT email INTO inviter_record FROM auth.users WHERE id = NEW.invited_by;

    -- URL de l'Edge Function (à configurer selon votre environnement)
    -- En local: http://localhost:54321/functions/v1/send-invitation-email
    -- En production: https://your-project.supabase.co/functions/v1/send-invitation-email
    function_url := current_setting('app.settings.edge_function_url', true);

    -- Si l'URL n'est pas configurée, utiliser une valeur par défaut
    IF function_url IS NULL THEN
        function_url := 'http://localhost:54321/functions/v1/send-invitation-email';
    END IF;

    -- Appeler l'Edge Function via pg_net (extension Supabase)
    -- Note: pg_net doit être activée dans votre projet Supabase
    PERFORM net.http_post(
        url := function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
            'email', NEW.email,
            'project_name', project_record.name,
            'invited_by_email', inviter_record.email,
            'role', NEW.role,
            'token', NEW.token
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Créer le trigger
DROP TRIGGER IF EXISTS trigger_notify_invitation_email ON public.project_invitations;
CREATE TRIGGER trigger_notify_invitation_email
AFTER INSERT ON public.project_invitations
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.notify_invitation_email();

COMMENT ON FUNCTION public.notify_invitation_email() IS 'Sends email notification when a new invitation is created';
COMMENT ON TRIGGER trigger_notify_invitation_email ON public.project_invitations IS 'Automatically triggers email sending for new invitations';
