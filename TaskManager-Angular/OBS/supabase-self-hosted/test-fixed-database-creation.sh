#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY1NDA0NTc4LCJleHAiOjIwODA5ODA1Nzh9.uxmGgPIWxA4EjqomO-rNLt4T62qMoLQn4Kz2alLhP8w"

echo "==========================================================================="
echo "🧪 Test: Create dynamic table with row_order column"
echo "==========================================================================="
echo ""

# Test create_dynamic_table with new row_order column
echo "1️⃣  Creating test table 'test_table_with_row_order'..."
response=$(curl -s -X POST "http://localhost:8000/rest/v1/rpc/create_dynamic_table" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "table_name": "test_table_with_row_order",
    "columns": [
      {"name": "title", "type": "TEXT", "required": true},
      {"name": "priority", "type": "INTEGER", "required": false}
    ]
  }')

echo "Response: $response"
echo ""

# Wait for PostgREST to reload schema
echo "⏳ Waiting 2 seconds for PostgREST schema cache reload..."
sleep 2

# Verify table structure
echo "2️⃣  Verifying table structure..."
docker exec supabase-db psql -U postgres -d postgres -c "\d test_table_with_row_order"
echo ""

# Try to insert a row with row_order
echo "3️⃣  Testing row insertion with row_order..."
insert_response=$(curl -s -X POST "http://localhost:8000/rest/v1/test_table_with_row_order" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "title": "Test Row 1",
    "priority": 5,
    "row_order": 0
  }')

echo "Insert response: $insert_response"
echo ""

# Query rows ordered by row_order
echo "4️⃣  Querying rows ordered by row_order..."
query_response=$(curl -s -X GET "http://localhost:8000/rest/v1/test_table_with_row_order?select=*&order=row_order.asc" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}")

echo "Query response: $query_response"
echo ""

# Cleanup
echo "5️⃣  Cleaning up test table..."
docker exec supabase-db psql -U postgres -d postgres -c "DROP TABLE IF EXISTS test_table_with_row_order CASCADE;" > /dev/null 2>&1

echo ""
echo "==========================================================================="
echo "✅ Test complete!"
echo "==========================================================================="
