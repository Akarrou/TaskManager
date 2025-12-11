#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzY1NDA0NTc4LCJleHAiOjIwODA5ODA1Nzh9.uxmGgPIWxA4EjqomO-rNLt4T62qMoLQn4Kz2alLhP8w"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NjU0MDQ1NzgsImV4cCI6MjA4MDk4MDU3OH0._KJYrE2oqGRxzT9ePjNZSTsIT29dNopcLsMhGByoOK0"

echo "=========================================================================="
echo "🧪 Testing Supabase Self-Hosted - All Features"
echo "=========================================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_passed=0
test_failed=0

# Function to test endpoint
test_endpoint() {
  local name=$1
  local url=$2
  local method=$3
  local data=$4
  local expected_status=$5
  local use_service_role=${6:-false}

  echo -n "Testing $name... "

  local api_key="${ANON_KEY}"
  if [ "$use_service_role" = "true" ]; then
    api_key="${SERVICE_ROLE_KEY}"
  fi

  response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" \
    -H "apikey: ${api_key}" \
    -H "Authorization: Bearer ${api_key}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$data")

  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$status_code" -eq "$expected_status" ]; then
    echo -e "${GREEN}✅ PASS${NC} (HTTP $status_code)"
    test_passed=$((test_passed + 1))
    if [ ! -z "$body" ]; then
      echo "   Response: $body" | head -c 100
      echo ""
    fi
  else
    echo -e "${RED}❌ FAIL${NC} (Expected $expected_status, got $status_code)"
    test_failed=$((test_failed + 1))
    if [ ! -z "$body" ]; then
      echo "   Error: $body"
    fi
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Testing RPC Functions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test get_all_users
test_endpoint "get_all_users()" \
  "http://localhost:8000/rest/v1/rpc/get_all_users" \
  "POST" \
  "{}" \
  200

# Test create_dynamic_table
test_endpoint "create_dynamic_table()" \
  "http://localhost:8000/rest/v1/rpc/create_dynamic_table" \
  "POST" \
  '{"table_name": "test_dynamic_table", "columns": [{"name": "name", "type": "text", "required": true}, {"name": "age", "type": "integer", "required": false}]}' \
  200

# Test create_update_trigger
test_endpoint "create_update_trigger()" \
  "http://localhost:8000/rest/v1/rpc/create_update_trigger" \
  "POST" \
  '{"table_name": "test_dynamic_table"}' \
  200

# Test add_column_to_table
test_endpoint "add_column_to_table()" \
  "http://localhost:8000/rest/v1/rpc/add_column_to_table" \
  "POST" \
  '{"table_name": "test_dynamic_table", "column_name": "email", "column_type": "text"}' \
  200

# Test delete_column_from_table
test_endpoint "delete_column_from_table()" \
  "http://localhost:8000/rest/v1/rpc/delete_column_from_table" \
  "POST" \
  '{"table_name": "test_dynamic_table", "column_name": "email"}' \
  200

# Test delete_dynamic_table
test_endpoint "delete_dynamic_table()" \
  "http://localhost:8000/rest/v1/rpc/delete_dynamic_table" \
  "POST" \
  '{"table_name": "test_dynamic_table"}' \
  200

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Testing CRUD Operations (SERVICE_ROLE)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create a test document (SERVICE_ROLE bypasses RLS)
test_endpoint "Create document (SERVICE_ROLE)" \
  "http://localhost:8000/rest/v1/documents" \
  "POST" \
  '{"title": "Test Document", "content": {}, "user_id": "e5f7e905-b1a3-4460-8d9f-0aef86e89f34"}' \
  201 \
  "true"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Testing Table Access"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# List projects (should work with ANON_KEY due to RLS policies)
test_endpoint "List projects" \
  "http://localhost:8000/rest/v1/projects?select=*" \
  "GET" \
  "" \
  200

# List tasks
test_endpoint "List tasks" \
  "http://localhost:8000/rest/v1/tasks?select=*" \
  "GET" \
  "" \
  200

echo ""
echo "=========================================================================="
echo "📊 Test Summary"
echo "=========================================================================="
echo ""
echo -e "${GREEN}Passed: $test_passed${NC}"
echo -e "${RED}Failed: $test_failed${NC}"
echo ""

if [ $test_failed -eq 0 ]; then
  echo -e "${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}⚠️  Some tests failed. Check output above.${NC}"
  exit 1
fi
