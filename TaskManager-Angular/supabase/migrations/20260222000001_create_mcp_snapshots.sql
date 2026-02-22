-- Create mcp_snapshots table for automatic pre-modification snapshots
CREATE TABLE IF NOT EXISTS public.mcp_snapshots (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    token text NOT NULL UNIQUE,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    table_name text,
    tool_name text NOT NULL,
    operation text NOT NULL,
    snapshot_data jsonb NOT NULL,
    user_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_mcp_snapshots_entity ON public.mcp_snapshots(entity_type, entity_id);
CREATE INDEX idx_mcp_snapshots_token ON public.mcp_snapshots(token);
CREATE INDEX idx_mcp_snapshots_created_at ON public.mcp_snapshots(created_at);

-- Allow service role full access (MCP server uses service role key)
ALTER TABLE public.mcp_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to mcp_snapshots"
    ON public.mcp_snapshots
    FOR ALL
    USING (true)
    WITH CHECK (true);
