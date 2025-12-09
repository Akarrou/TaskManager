-- Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Sans titre',
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    user_id UUID REFERENCES auth.users(id), -- Optional: link to creator if auth is used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Policies (Adjust based on your auth requirements)
-- For now, allowing all authenticated users to read/write all documents (collaborative-ish)
-- Or restrict to owner: USING (auth.uid() = user_id)

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.documents;
CREATE POLICY "Enable all access for authenticated users" ON public.documents
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_documents_modtime ON public.documents;
CREATE TRIGGER update_documents_modtime
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();
