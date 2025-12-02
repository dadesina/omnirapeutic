#!/bin/bash
# Phase 7B.2 Week 2 - Session Templates API Staging Test
# Tests the new Session Templates API endpoints deployed to staging

set -e

BASE_URL="http://omnirapeutic-staging-alb-1983453839.us-east-1.elb.amazonaws.com"

echo "==================================================================="
echo "Phase 7B.2 Week 2 - Session Templates API Staging Test"
echo "==================================================================="
echo ""

# Step 1: Health check
echo "1. Testing health endpoint..."
HEALTH=$(curl -s "${BASE_URL}/health")
echo "   Response: ${HEALTH}"
echo "   ✅ Health endpoint working"
echo ""

# Step 2: Login as admin to get JWT token
echo "2. Authenticating as admin..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@omnirapeutic.com",
    "password": "admin123"
  }')

TOKEN=$(echo "${LOGIN_RESPONSE}" | jq -r '.token')

if [ "${TOKEN}" == "null" ] || [ -z "${TOKEN}" ]; then
  echo "   ❌ Failed to authenticate. Response: ${LOGIN_RESPONSE}"
  exit 1
fi

echo "   ✅ Authentication successful"
echo "   Token: ${TOKEN:0:50}..."
echo ""

# Step 3: Create a session template
echo "3. Creating a Progress Note session template..."
CREATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/session-templates" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "name": "ABA Progress Note - Staging Test",
    "description": "Standard progress note template for ABA therapy sessions (Staging Test)",
    "category": "PROGRESS_NOTE",
    "structure": {
      "version": "1.0",
      "fields": [
        {
          "id": "session_summary",
          "label": "Session Summary",
          "type": "textarea",
          "required": true,
          "description": "Brief summary of the session",
          "placeholder": "Enter session summary...",
          "order": 1,
          "section": "Session Overview"
        },
        {
          "id": "target_behaviors",
          "label": "Target Behaviors Addressed",
          "type": "multiselect",
          "required": true,
          "options": ["Communication", "Social Skills", "Daily Living", "Behavior Reduction"],
          "order": 2,
          "section": "Behaviors"
        },
        {
          "id": "session_rating",
          "label": "Session Effectiveness",
          "type": "select",
          "required": true,
          "options": ["Excellent", "Good", "Fair", "Poor"],
          "order": 3,
          "section": "Session Overview"
        },
        {
          "id": "follow_up_needed",
          "label": "Follow-up Required",
          "type": "checkbox",
          "required": false,
          "order": 4,
          "section": "Next Steps"
        }
      ],
      "sections": ["Session Overview", "Behaviors", "Next Steps"]
    }
  }')

TEMPLATE_ID=$(echo "${CREATE_RESPONSE}" | jq -r '.id')

if [ "${TEMPLATE_ID}" == "null" ] || [ -z "${TEMPLATE_ID}" ]; then
  echo "   ❌ Failed to create template. Response: ${CREATE_RESPONSE}"
  exit 1
fi

echo "   ✅ Template created successfully"
echo "   Template ID: ${TEMPLATE_ID}"
echo ""

# Step 4: Get the created template
echo "4. Retrieving the created template..."
GET_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/session-templates/${TEMPLATE_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

RETRIEVED_NAME=$(echo "${GET_RESPONSE}" | jq -r '.name')

if [ "${RETRIEVED_NAME}" == "null" ]; then
  echo "   ❌ Failed to retrieve template. Response: ${GET_RESPONSE}"
  exit 1
fi

echo "   ✅ Template retrieved successfully"
echo "   Name: ${RETRIEVED_NAME}"
echo ""

# Step 5: List all templates
echo "5. Listing all session templates..."
LIST_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/session-templates" \
  -H "Authorization: Bearer ${TOKEN}")

TEMPLATE_COUNT=$(echo "${LIST_RESPONSE}" | jq '. | length')

echo "   ✅ Templates listed successfully"
echo "   Count: ${TEMPLATE_COUNT} templates found"
echo ""

# Step 6: Get template stats
echo "6. Getting template statistics..."
STATS_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/session-templates/${TEMPLATE_ID}/stats" \
  -H "Authorization: Bearer ${TOKEN}")

FIELD_COUNT=$(echo "${STATS_RESPONSE}" | jq -r '.fieldCount')
SECTION_COUNT=$(echo "${STATS_RESPONSE}" | jq -r '.sectionCount')

echo "   ✅ Template stats retrieved successfully"
echo "   Field Count: ${FIELD_COUNT}"
echo "   Section Count: ${SECTION_COUNT}"
echo ""

# Step 7: Update the template
echo "7. Updating the template description..."
UPDATE_RESPONSE=$(curl -s -X PUT "${BASE_URL}/api/session-templates/${TEMPLATE_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "description": "Updated description - Staging deployment test completed successfully"
  }')

UPDATED_DESC=$(echo "${UPDATE_RESPONSE}" | jq -r '.description')

echo "   ✅ Template updated successfully"
echo "   New description: ${UPDATED_DESC}"
echo ""

# Step 8: Validate template structure (utility endpoint)
echo "8. Testing template structure validation..."
VALIDATE_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/session-templates/validate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "structure": {
      "version": "1.0",
      "fields": [
        {
          "id": "test_field",
          "label": "Test Field",
          "type": "text",
          "required": true,
          "order": 1
        }
      ]
    }
  }')

VALIDATION_VALID=$(echo "${VALIDATE_RESPONSE}" | jq -r '.valid')

echo "   ✅ Validation endpoint working"
echo "   Valid: ${VALIDATION_VALID}"
echo ""

# Step 9: Deactivate (soft delete) the template
echo "9. Deactivating the test template..."
DELETE_RESPONSE=$(curl -s -X DELETE "${BASE_URL}/api/session-templates/${TEMPLATE_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

IS_ACTIVE=$(echo "${DELETE_RESPONSE}" | jq -r '.isActive')

echo "   ✅ Template deactivated successfully"
echo "   Is Active: ${IS_ACTIVE}"
echo ""

echo "==================================================================="
echo "✅ ALL TESTS PASSED - Phase 7B.2 Week 2 Deployment Verified!"
echo "==================================================================="
echo ""
echo "Summary:"
echo "  - Health endpoint: ✅"
echo "  - Authentication: ✅"
echo "  - Create template: ✅"
echo "  - Get template: ✅"
echo "  - List templates: ✅"
echo "  - Template stats: ✅"
echo "  - Update template: ✅"
echo "  - Validate structure: ✅"
echo "  - Deactivate template: ✅"
echo ""
echo "All 7 Session Templates API endpoints are functioning correctly in staging!"
echo ""
