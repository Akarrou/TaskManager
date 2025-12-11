#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY1NDA0NTc4LCJleHAiOjIwODA5ODA1Nzh9.uxmGgPIWxA4EjqomO-rNLt4T62qMoLQn4Kz2alLhP8w"

echo "Testing PostgREST introspection..."
echo ""

echo "1. List all available RPC functions:"
curl -s "http://localhost:8000/rest/v1/" \
  -H "apikey: ${ANON_KEY}" \
  -H "Accept: application/openapi+json" | python3 -c "import sys, json; data=json.load(sys.stdin); print(json.dumps([p for p in data.get('paths', {}).keys() if '/rpc/' in p], indent=2))"

echo ""
echo "2. Try to call create_dynamic_table:"
curl -v "http://localhost:8000/rest/v1/rpc/create_dynamic_table" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"table_name": "test_table", "columns": [{"name": "col1", "type": "text", "required": false}]}' 2>&1 | grep -E "HTTP|{|}"

echo ""
