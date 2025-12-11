#!/bin/bash

SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjU0MDQ1NzgsImV4cCI6MjA4MDk4MDU3OH0._KJYrE2oqGRxzT9ePjNZSTsIT29dNopcLsMhGByoOK0"

echo "Testing document creation with SERVICE_ROLE_KEY (bypasses RLS)..."
curl -X POST "http://localhost:8000/rest/v1/documents" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"title": "Test with SERVICE_ROLE", "content": {}, "user_id": "e5f7e905-b1a3-4460-8d9f-0aef86e89f34"}'

echo ""
