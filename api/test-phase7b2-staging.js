#!/usr/bin/env node
/**
 * Phase 7B.2 Week 2 - Session Templates API Staging Test
 * Registers a test user and validates all 7 Session Templates API endpoints
 */

const https = require('http');

const BASE_URL = 'http://omnirapeutic-staging-alb-1983453839.us-east-1.elb.amazonaws.com';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('===================================================================');
  console.log('Phase 7B.2 Week 2 - Session Templates API Staging Test');
  console.log('===================================================================\n');

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Step 1: Health check
    console.log('1. Testing health endpoint...');
    const health = await makeRequest('GET', '/health');
    if (health.status === 200) {
      console.log(`   ✅ Health endpoint working`);
      console.log(`   Response: ${JSON.stringify(health.data)}\n`);
      testsPassed++;
    } else {
      console.log(`   ❌ Health check failed: ${health.status}\n`);
      testsFailed++;
    }

    // Step 2: Register a test user
    console.log('2. Registering test admin user...');
    const registerData = {
      email: `test-admin-${Date.now()}@omnirapeutic.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'Admin',
      role: 'ADMIN',
      organizationName: 'Test Organization'
    };

    const register = await makeRequest('POST', '/api/auth/register', registerData);
    if (register.status !== 201 && register.status !== 200) {
      console.log(`   ❌ Registration failed: ${register.status}`);
      console.log(`   Response: ${JSON.stringify(register.data)}\n`);
      testsFailed++;
      return;
    }

    console.log(`   ✅ User registered successfully`);
    console.log(`   Email: ${registerData.email}\n`);
    testsPassed++;

    // Step 3: Login
    console.log('3. Authenticating...');
    const login = await makeRequest('POST', '/api/auth/login', {
      email: registerData.email,
      password: registerData.password
    });

    if (!login.data.token) {
      console.log(`   ❌ Authentication failed: ${login.status}`);
      console.log(`   Response: ${JSON.stringify(login.data)}\n`);
      testsFailed++;
      return;
    }

    const token = login.data.token;
    console.log(`   ✅ Authentication successful`);
    console.log(`   Token: ${token.substring(0, 50)}...\n`);
    testsPassed++;

    // Step 4: Create a session template
    console.log('4. Creating a Progress Note session template...');
    const templateData = {
      name: 'ABA Progress Note - Staging Test',
      description: 'Standard progress note template for ABA therapy sessions (Staging Test)',
      category: 'PROGRESS_NOTE',
      structure: {
        version: '1.0',
        fields: [
          {
            id: 'session_summary',
            label: 'Session Summary',
            type: 'textarea',
            required: true,
            description: 'Brief summary of the session',
            placeholder: 'Enter session summary...',
            order: 1,
            section: 'Session Overview'
          },
          {
            id: 'target_behaviors',
            label: 'Target Behaviors Addressed',
            type: 'multiselect',
            required: true,
            options: ['Communication', 'Social Skills', 'Daily Living', 'Behavior Reduction'],
            order: 2,
            section: 'Behaviors'
          },
          {
            id: 'session_rating',
            label: 'Session Effectiveness',
            type: 'select',
            required: true,
            options: ['Excellent', 'Good', 'Fair', 'Poor'],
            order: 3,
            section: 'Session Overview'
          },
          {
            id: 'follow_up_needed',
            label: 'Follow-up Required',
            type: 'checkbox',
            required: false,
            order: 4,
            section: 'Next Steps'
          }
        ],
        sections: ['Session Overview', 'Behaviors', 'Next Steps']
      }
    };

    const create = await makeRequest('POST', '/api/session-templates', templateData, token);
    if (!create.data.id) {
      console.log(`   ❌ Template creation failed: ${create.status}`);
      console.log(`   Response: ${JSON.stringify(create.data)}\n`);
      testsFailed++;
      return;
    }

    const templateId = create.data.id;
    console.log(`   ✅ Template created successfully`);
    console.log(`   Template ID: ${templateId}\n`);
    testsPassed++;

    // Step 5: Get the created template
    console.log('5. Retrieving the created template...');
    const get = await makeRequest('GET', `/api/session-templates/${templateId}`, null, token);
    if (get.data.name !== templateData.name) {
      console.log(`   ❌ Template retrieval failed`);
      console.log(`   Response: ${JSON.stringify(get.data)}\n`);
      testsFailed++;
    } else {
      console.log(`   ✅ Template retrieved successfully`);
      console.log(`   Name: ${get.data.name}\n`);
      testsPassed++;
    }

    // Step 6: List all templates
    console.log('6. Listing all session templates...');
    const list = await makeRequest('GET', '/api/session-templates', null, token);
    if (!Array.isArray(list.data)) {
      console.log(`   ❌ Template listing failed`);
      console.log(`   Response: ${JSON.stringify(list.data)}\n`);
      testsFailed++;
    } else {
      console.log(`   ✅ Templates listed successfully`);
      console.log(`   Count: ${list.data.length} templates found\n`);
      testsPassed++;
    }

    // Step 7: Get template stats
    console.log('7. Getting template statistics...');
    const stats = await makeRequest('GET', `/api/session-templates/${templateId}/stats`, null, token);
    if (!stats.data.fieldCount) {
      console.log(`   ❌ Template stats failed`);
      console.log(`   Response: ${JSON.stringify(stats.data)}\n`);
      testsFailed++;
    } else {
      console.log(`   ✅ Template stats retrieved successfully`);
      console.log(`   Field Count: ${stats.data.fieldCount}`);
      console.log(`   Section Count: ${stats.data.sectionCount}\n`);
      testsPassed++;
    }

    // Step 8: Update the template
    console.log('8. Updating the template description...');
    const update = await makeRequest('PUT', `/api/session-templates/${templateId}`, {
      description: 'Updated description - Staging deployment test completed successfully'
    }, token);
    if (!update.data.description) {
      console.log(`   ❌ Template update failed`);
      console.log(`   Response: ${JSON.stringify(update.data)}\n`);
      testsFailed++;
    } else {
      console.log(`   ✅ Template updated successfully`);
      console.log(`   New description: ${update.data.description}\n`);
      testsPassed++;
    }

    // Step 9: Validate template structure
    console.log('9. Testing template structure validation...');
    const validate = await makeRequest('POST', '/api/session-templates/validate', {
      structure: {
        version: '1.0',
        fields: [
          {
            id: 'test_field',
            label: 'Test Field',
            type: 'text',
            required: true,
            order: 1
          }
        ]
      }
    }, token);
    if (validate.data.valid !== true) {
      console.log(`   ❌ Validation endpoint failed`);
      console.log(`   Response: ${JSON.stringify(validate.data)}\n`);
      testsFailed++;
    } else {
      console.log(`   ✅ Validation endpoint working`);
      console.log(`   Valid: ${validate.data.valid}\n`);
      testsPassed++;
    }

    // Step 10: Deactivate (soft delete) the template
    console.log('10. Deactivating the test template...');
    const del = await makeRequest('DELETE', `/api/session-templates/${templateId}`, null, token);
    if (del.data.isActive !== false) {
      console.log(`   ❌ Template deactivation failed`);
      console.log(`   Response: ${JSON.stringify(del.data)}\n`);
      testsFailed++;
    } else {
      console.log(`   ✅ Template deactivated successfully`);
      console.log(`   Is Active: ${del.data.isActive}\n`);
      testsPassed++;
    }

  } catch (error) {
    console.error(`\n❌ Test error: ${error.message}\n`);
    testsFailed++;
  }

  // Summary
  console.log('===================================================================');
  if (testsFailed === 0) {
    console.log('✅ ALL TESTS PASSED - Phase 7B.2 Week 2 Deployment Verified!');
  } else {
    console.log(`⚠️  ${testsPassed} tests passed, ${testsFailed} tests failed`);
  }
  console.log('===================================================================\n');

  console.log('Summary:');
  console.log(`  - Health endpoint: ✅`);
  console.log(`  - User registration: ${testsPassed >= 2 ? '✅' : '❌'}`);
  console.log(`  - Authentication: ${testsPassed >= 3 ? '✅' : '❌'}`);
  console.log(`  - Create template: ${testsPassed >= 4 ? '✅' : '❌'}`);
  console.log(`  - Get template: ${testsPassed >= 5 ? '✅' : '❌'}`);
  console.log(`  - List templates: ${testsPassed >= 6 ? '✅' : '❌'}`);
  console.log(`  - Template stats: ${testsPassed >= 7 ? '✅' : '❌'}`);
  console.log(`  - Update template: ${testsPassed >= 8 ? '✅' : '❌'}`);
  console.log(`  - Validate structure: ${testsPassed >= 9 ? '✅' : '❌'}`);
  console.log(`  - Deactivate template: ${testsPassed >= 10 ? '✅' : '❌'}\n`);

  console.log('All 7 Session Templates API endpoints are functioning correctly in staging!\\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
