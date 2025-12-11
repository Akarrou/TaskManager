#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY1NDA0NTc4LCJleHAiOjIwODA5ODA1Nzh9.uxmGgPIWxA4EjqomO-rNLt4T62qMoLQn4Kz2alLhP8w"

echo "Testing create_update_trigger RPC function..."
echo ""

curl -v "http://localhost:8000/rest/v1/rpc/create_update_trigger" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"table_name": "test_table"}' 2>&1 | grep -E "HTTP|{|}"

echo ""
