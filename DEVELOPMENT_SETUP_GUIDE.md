# Development Environment Setup Guide

**Project:** Omnirapeutic
**Version:** 1.0
**Last Updated:** 2025-11-24

---

## Overview

This guide provides step-by-step instructions for setting up the complete development environment for Omnirapeutic, including local development tools, Supabase configuration, and the CI/CD pipeline.

**Estimated Setup Time:** 2-3 hours

---

## Prerequisites

### Required Accounts

- [ ] GitHub account (for code repository)
- [ ] Supabase account (for database and backend)
- [ ] AWS account (for Secrets Manager and potential fallback hosting)
- [ ] OpenAI account (for Whisper API)
- [ ] Google Cloud account (for Gemini API)
- [ ] Stedi account (for EDI claims)
- [ ] Vercel account (optional, for web preview)

### System Requirements

**Operating System:**
- macOS 12+ (recommended)
- Ubuntu 20.04+ (Linux)
- Windows 10+ with WSL2

**Hardware:**
- 16GB RAM minimum (32GB recommended)
- 50GB free disk space
- Multi-core processor (4+ cores)

---

## Part 1: Local Development Tools

### 1.1 Install Node.js 20 LTS

**macOS (using Homebrew):**
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 20
brew install node@20

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

**Ubuntu/Debian:**
```bash
# Install Node.js 20 from NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

**Windows (WSL2):**
```bash
# Follow Ubuntu instructions above in WSL2 terminal
```

### 1.2 Install PostgreSQL 15 (for local development)

**macOS:**
```bash
# Install PostgreSQL 15
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Create default database
createdb omnirapeutic_dev

# Verify installation
psql --version  # Should show PostgreSQL 15.x
```

**Ubuntu:**
```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# Install PostgreSQL 15
sudo apt-get update
sudo apt-get install -y postgresql-15

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres createdb omnirapeutic_dev
sudo -u postgres createuser $(whoami)
sudo -u postgres psql -c "ALTER USER $(whoami) WITH SUPERUSER;"

# Verify installation
psql --version
```

### 1.3 Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Linux
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/supabase

# Verify installation
supabase --version
```

### 1.4 Install Expo CLI

```bash
# Install Expo CLI globally
npm install -g expo-cli@latest

# Install EAS CLI (for builds and deployments)
npm install -g eas-cli@latest

# Verify installation
expo --version
eas --version
```

### 1.5 Install Git

```bash
# macOS (should be pre-installed)
git --version

# Ubuntu
sudo apt-get install -y git

# Configure Git
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Verify
git config --list
```

### 1.6 Install Docker (for local Supabase)

**macOS:**
```bash
# Download Docker Desktop from https://www.docker.com/products/docker-desktop
# Or install via Homebrew
brew install --cask docker

# Start Docker Desktop
open /Applications/Docker.app

# Verify
docker --version
docker-compose --version
```

**Ubuntu:**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt-get install -y docker-compose

# Verify
docker --version
docker-compose --version
```

### 1.7 Install VSCode and Extensions

**Install VSCode:**
```bash
# macOS
brew install --cask visual-studio-code

# Ubuntu
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
sudo install -o root -g root -m 644 packages.microsoft.gpg /etc/apt/trusted.gpg.d/
sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
sudo apt-get update
sudo apt-get install -y code
```

**Required VSCode Extensions:**
```bash
# Install extensions via command line
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension bradlc.vscode-tailwindcss
code --install-extension supabase.supabase-vscode
code --install-extension github.copilot  # Optional
```

**VSCode Settings (`.vscode/settings.json`):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

---

## Part 2: Project Setup

### 2.1 Create Project Repository

```bash
# Create project directory
mkdir -p ~/projects/omnirapeutic
cd ~/projects/omnirapeutic

# Initialize Git repository
git init
git branch -M main

# Create .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
.nyc_output

# Production
build/
dist/
.expo/
.expo-shared/

# Environment variables
.env
.env.local
.env.*.local
.env.production

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Editor directories
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Supabase
.supabase/

# Secrets
secrets.json
*.pem
*.key

# Temporary files
tmp/
temp/
EOF

# Create initial commit
git add .gitignore
git commit -m "Initial commit: Add .gitignore"
```

### 2.2 Create GitHub Repository

```bash
# Create repository on GitHub (via CLI)
gh repo create omnirapeutic/omnirapeutic-platform --private --source=. --remote=origin

# Or manually:
# 1. Go to https://github.com/new
# 2. Create private repository: omnirapeutic-platform
# 3. Add remote
git remote add origin https://github.com/YOUR_USERNAME/omnirapeutic-platform.git

# Push initial commit
git push -u origin main
```

### 2.3 Initialize Supabase Project

```bash
# Login to Supabase
supabase login

# Initialize Supabase in project
supabase init

# This creates:
# - supabase/config.toml
# - supabase/seed.sql
# - supabase/.gitignore
```

**Configure `supabase/config.toml`:**
```toml
[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[db.pooler]
enabled = false
port = 54329
pool_mode = "transaction"
default_pool_size = 20
max_client_conn = 100

[realtime]
enabled = true
ip_version = "ipv4"

[studio]
enabled = true
port = 54323
api_url = "http://localhost"

[inbucket]
enabled = true
port = 54324
smtp_port = 54325
pop3_port = 54326

[storage]
enabled = true
file_size_limit = "50MiB"

[auth]
enabled = true
site_url = "http://localhost:19006"
additional_redirect_urls = ["exp://localhost:19000"]
jwt_expiry = 3600
enable_signup = false

[auth.email]
enable_signup = false
double_confirm_changes = true
enable_confirmations = true

[functions]
runtime = "deno"
```

### 2.4 Start Local Supabase

```bash
# Start Supabase (Docker required)
supabase start

# This will output:
# - API URL: http://localhost:54321
# - DB URL: postgresql://postgres:postgres@localhost:54322/postgres
# - Studio URL: http://localhost:54323
# - anon key: eyJ...
# - service_role key: eyJ...

# Save these credentials!

# Stop Supabase when done
supabase stop
```

### 2.5 Create Project Structure

```bash
# Create directory structure
mkdir -p apps/mobile/{app,components,hooks,lib,types,assets}
mkdir -p apps/mobile/app/{_layout.tsx,\(tabs\)}
mkdir -p packages/{database,shared,api-client}
mkdir -p supabase/{migrations,functions}
mkdir -p docs/{architecture,api,guides}
mkdir -p tests/{unit,integration,e2e,load}

# Create package.json
cat > package.json << 'EOF'
{
  "name": "omnirapeutic",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=apps/mobile",
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "playwright test",
    "test:load": "k6 run tests/load/concurrent-sessions.test.ts",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:status": "supabase status",
    "db:migrate": "supabase db push",
    "db:reset": "supabase db reset",
    "db:seed": "supabase db seed"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.45",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.0",
    "typescript": "^5.3.0"
  }
}
EOF

# Install dependencies
npm install
```

### 2.6 Create Mobile App

```bash
cd apps
npx create-expo-app mobile --template blank-typescript
cd mobile

# Install Supabase and dependencies
npm install @supabase/supabase-js
npm install react-native-url-polyfill
npm install @tanstack/react-query
npm install zustand
npm install react-hook-form zod @hookform/resolvers
npm install date-fns
npm install rrule
npm install expo-av
npm install react-native-paper
```

**Configure `apps/mobile/package.json`:**
```json
{
  "name": "@omnirapeutic/mobile",
  "version": "0.1.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest"
  }
}
```

### 2.7 Configure Environment Variables

**Create `.env.example`:**
```bash
cat > .env.example << 'EOF'
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# AWS (for Secrets Manager)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# OpenAI (stored in AWS Secrets Manager)
# OPENAI_API_KEY=sk-...

# Google Cloud (stored in AWS Secrets Manager)
# GOOGLE_CLOUD_API_KEY=...

# Stedi (stored in AWS Secrets Manager)
# STEDI_API_KEY=...

# Environment
NODE_ENV=development
EOF

# Create actual .env (DO NOT COMMIT)
cp .env.example .env

# Edit .env with actual values
# nano .env
```

### 2.8 Configure TypeScript

**Root `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./",
    "baseUrl": ".",
    "paths": {
      "@omnirapeutic/*": ["packages/*/src"]
    }
  },
  "exclude": ["node_modules", "dist", "build", ".expo"]
}
```

**Mobile app `tsconfig.json` (apps/mobile/tsconfig.json):**
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./"],
      "@/components/*": ["./components/*"],
      "@/hooks/*": ["./hooks/*"],
      "@/lib/*": ["./lib/*"],
      "@/types/*": ["./types/*"]
    }
  }
}
```

### 2.9 Configure ESLint

**Create `.eslintrc.js`:**
```javascript
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true
    },
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error'
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};
```

### 2.10 Configure Prettier

**Create `.prettierrc`:**
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

---

## Part 3: Supabase Cloud Setup

### 3.1 Create Supabase Project

```bash
# Option 1: Via CLI
supabase projects create omnirapeutic-production --org-id YOUR_ORG_ID --region us-east-1 --plan pro

# Option 2: Via Dashboard
# 1. Go to https://app.supabase.com
# 2. Click "New Project"
# 3. Name: omnirapeutic-production
# 4. Database Password: [generate strong password]
# 5. Region: US East (recommended)
# 6. Plan: Pro ($25/month)
# 7. Click "Create new project"
```

### 3.2 Link Local Project to Cloud

```bash
# Link to remote project
supabase link --project-ref YOUR_PROJECT_REF

# Get project credentials
supabase status

# Update .env with production values
# SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
# SUPABASE_ANON_KEY=eyJ...
```

### 3.3 Configure Supabase Auth

**In Supabase Dashboard:**
1. Go to Authentication > Settings
2. **Site URL:** `https://app.omnirapeutic.com` (or `exp://localhost:19000` for dev)
3. **Redirect URLs:** Add:
   - `https://app.omnirapeutic.com/**`
   - `exp://localhost:19000/**`
   - `http://localhost:19006/**`
4. **Email Auth:**
   - Disable sign-ups (invite-only)
   - Enable email confirmations
   - Enable double opt-in for changes
5. **JWT Expiry:** 3600 seconds (1 hour)
6. Save changes

### 3.4 Configure Supabase Storage

```bash
# Create storage bucket for voice notes
supabase storage create voice-notes --public false

# Set up storage policies (in Supabase Dashboard > Storage > Policies)
```

**Storage Policy SQL:**
```sql
-- Allow authenticated users to upload voice notes
CREATE POLICY "Users can upload voice notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voice-notes' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own voice notes
CREATE POLICY "Users can read own voice notes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'voice-notes' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## Part 4: AWS Setup

### 4.1 Install AWS CLI

```bash
# macOS
brew install awscli

# Ubuntu
sudo apt-get install -y awscli

# Verify
aws --version
```

### 4.2 Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Enter:
# AWS Access Key ID: [your access key]
# AWS Secret Access Key: [your secret key]
# Default region name: us-east-1
# Default output format: json

# Test configuration
aws sts get-caller-identity
```

### 4.3 Create Secrets Manager Secrets

```bash
# Store OpenAI API key
aws secretsmanager create-secret \
  --name omnirapeutic/openai-api-key \
  --description "OpenAI API key for Whisper transcription" \
  --secret-string "sk-YOUR-OPENAI-KEY-HERE"

# Store Gemini API key
aws secretsmanager create-secret \
  --name omnirapeutic/gemini-api-key \
  --description "Google Gemini API key for SOAP note generation" \
  --secret-string "YOUR-GEMINI-KEY-HERE"

# Store Stedi API key
aws secretsmanager create-secret \
  --name omnirapeutic/stedi-api-key \
  --description "Stedi API key for EDI claims" \
  --secret-string "YOUR-STEDI-KEY-HERE"

# Store Supabase service role key
aws secretsmanager create-secret \
  --name omnirapeutic/supabase-service-role-key \
  --description "Supabase service role key for admin operations" \
  --secret-string "eyJ-YOUR-SERVICE-ROLE-KEY-HERE"

# List secrets
aws secretsmanager list-secrets

# Test retrieval
aws secretsmanager get-secret-value --secret-id omnirapeutic/openai-api-key
```

### 4.4 Sign AWS BAA

```bash
# Download BAA from AWS Artifact
# 1. Go to https://console.aws.amazon.com/artifact/
# 2. Navigate to "Agreements"
# 3. Find "AWS Business Associate Addendum"
# 4. Click "Download Agreement"
# 5. Review and accept electronically
# 6. Save signed copy to docs/compliance/AWS_BAA.pdf
```

---

## Part 5: CI/CD Pipeline Setup

### 5.1 GitHub Actions Configuration

**Create `.github/workflows/ci.yml`:**
```yaml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    name: Lint Code
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Check formatting
        run: npm run format -- --check

  typecheck:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run type check
        run: npm run typecheck

  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests

  test-integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: omnirapeutic_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase
        run: supabase start

      - name: Run migrations
        run: supabase db push

      - name: Run integration tests
        run: npm run test:integration
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}

      - name: Stop Supabase
        run: supabase stop

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --production --audit-level=high

      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets
            p/owasp-top-ten

  build:
    name: Build Mobile App
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test-unit]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm ci

      - name: Build app
        run: cd apps/mobile && expo export --platform all

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: expo-build
          path: apps/mobile/dist/
```

**Create `.github/workflows/deploy-staging.yml`:**
```yaml
name: Deploy to Staging

on:
  push:
    branches: [develop]

jobs:
  deploy-database:
    name: Deploy Database Migrations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Link to Supabase project
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Run migrations
        run: supabase db push

  deploy-functions:
    name: Deploy Edge Functions
    runs-on: ubuntu-latest
    needs: [deploy-database]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Deploy functions
        run: |
          supabase functions deploy --project-ref ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  deploy-mobile:
    name: Deploy Mobile App (EAS)
    runs-on: ubuntu-latest
    needs: [deploy-functions]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm ci

      - name: Build and deploy with EAS
        run: |
          cd apps/mobile
          eas build --platform all --profile staging --non-interactive
          eas submit --platform all --profile staging --non-interactive
```

### 5.2 GitHub Secrets Configuration

**Add secrets to GitHub repository:**

1. Go to repository Settings > Secrets and variables > Actions
2. Add the following secrets:

```
SUPABASE_ACCESS_TOKEN           # From Supabase dashboard
SUPABASE_STAGING_PROJECT_REF    # Staging project reference
SUPABASE_PRODUCTION_PROJECT_REF # Production project reference
SUPABASE_TEST_ANON_KEY          # For testing
EXPO_TOKEN                      # From expo.dev account
AWS_ACCESS_KEY_ID               # For AWS deployments
AWS_SECRET_ACCESS_KEY           # For AWS deployments
CODECOV_TOKEN                   # From codecov.io
```

### 5.3 Configure Branch Protection

**In GitHub repository settings:**

1. Go to Settings > Branches
2. Add branch protection rule for `main`:
   - Require pull request reviews (1 approval minimum)
   - Require status checks to pass:
     - lint
     - typecheck
     - test-unit
     - test-integration
     - security-scan
   - Require branches to be up to date
   - Do not allow bypassing the above settings
3. Add branch protection rule for `develop`:
   - Require status checks to pass
   - Allow force pushes (for rebasing)

### 5.4 Configure Automated Testing

**Create `jest.config.js`:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'apps/**/*.{ts,tsx}',
    'packages/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.expo/**',
    '!**/dist/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/apps/mobile/$1',
    '^@omnirapeutic/(.*)$': '<rootDir>/packages/$1/src'
  }
};
```

**Install Playwright for E2E tests:**
```bash
npm install -D @playwright/test
npx playwright install
```

**Create `playwright.config.ts`:**
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:19006',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:19006',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Part 6: Monitoring and Observability

### 6.1 Sentry Setup (Error Tracking)

```bash
# Install Sentry
npm install @sentry/react-native

# Initialize Sentry in app
npx @sentry/wizard -i reactNative -p ios android
```

**Configure Sentry (`apps/mobile/App.tsx`):**
```typescript
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  enableAutoSessionTracking: true,
  sessionTrackingIntervalMillis: 30000,
});

export default Sentry.wrap(App);
```

### 6.2 Datadog Setup (APM)

```bash
# Install Datadog
npm install @datadog/mobile-react-native
```

**Configure Datadog:**
```typescript
import { DdSdkReactNative, DdSdkReactNativeConfiguration } from '@datadog/mobile-react-native';

const config = new DdSdkReactNativeConfiguration(
  process.env.DATADOG_CLIENT_TOKEN!,
  process.env.DATADOG_ENV!,
  process.env.DATADOG_APPLICATION_ID!,
  true,
  true,
  true
);

DdSdkReactNative.initialize(config);
```

### 6.3 Supabase Monitoring

**In Supabase Dashboard:**
1. Go to Reports
2. Enable:
   - Database usage monitoring
   - API usage monitoring
   - Storage usage monitoring
3. Set up alerts for:
   - Database connections > 80%
   - API requests > 90% of quota
   - Storage > 80% full

---

## Part 7: Verification Checklist

### Development Environment Verification

```bash
# Run verification script
cat > scripts/verify-setup.sh << 'EOF'
#!/bin/bash

echo "Verifying Omnirapeutic Development Environment..."
echo ""

# Check Node.js
if command -v node &> /dev/null; then
  echo "✓ Node.js installed: $(node --version)"
else
  echo "✗ Node.js not found"
  exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
  echo "✓ npm installed: $(npm --version)"
else
  echo "✗ npm not found"
  exit 1
fi

# Check PostgreSQL
if command -v psql &> /dev/null; then
  echo "✓ PostgreSQL installed: $(psql --version)"
else
  echo "✗ PostgreSQL not found"
  exit 1
fi

# Check Supabase CLI
if command -v supabase &> /dev/null; then
  echo "✓ Supabase CLI installed: $(supabase --version)"
else
  echo "✗ Supabase CLI not found"
  exit 1
fi

# Check Expo CLI
if command -v expo &> /dev/null; then
  echo "✓ Expo CLI installed: $(expo --version)"
else
  echo "✗ Expo CLI not found"
  exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
  echo "✓ Docker installed: $(docker --version)"
else
  echo "✗ Docker not found"
  exit 1
fi

# Check Git
if command -v git &> /dev/null; then
  echo "✓ Git installed: $(git --version)"
else
  echo "✗ Git not found"
  exit 1
fi

# Check AWS CLI
if command -v aws &> /dev/null; then
  echo "✓ AWS CLI installed: $(aws --version)"
else
  echo "✗ AWS CLI not found"
  exit 1
fi

# Check .env file
if [ -f .env ]; then
  echo "✓ .env file exists"
else
  echo "✗ .env file not found"
  exit 1
fi

# Check Supabase local
if docker ps | grep -q supabase; then
  echo "✓ Supabase is running"
else
  echo "⚠ Supabase is not running (run 'supabase start')"
fi

echo ""
echo "✓ Development environment verification complete!"
EOF

chmod +x scripts/verify-setup.sh
./scripts/verify-setup.sh
```

### CI/CD Pipeline Verification

```bash
# Test CI pipeline locally (requires act)
npm install -g act

# Run CI pipeline locally
act -j lint
act -j typecheck
act -j test-unit

# Or push to a test branch
git checkout -b test/ci-verification
git push origin test/ci-verification

# Check GitHub Actions tab in repository
```

---

## Part 8: Next Steps

### Immediate Actions (Day 1)

- [ ] Complete all installations from Part 1
- [ ] Create project structure from Part 2
- [ ] Start local Supabase instance
- [ ] Verify environment with verification script
- [ ] Commit initial project structure to GitHub

### Short-term Actions (Week 1)

- [ ] Set up Supabase cloud project
- [ ] Configure AWS Secrets Manager
- [ ] Set up GitHub Actions CI/CD
- [ ] Configure monitoring (Sentry, Datadog)
- [ ] Create first database migration (organizations table)
- [ ] Run first test deployment to staging

### Documentation

- [ ] Document any setup issues encountered
- [ ] Create team onboarding guide
- [ ] Document local development workflow
- [ ] Create troubleshooting guide

---

## Troubleshooting

### Common Issues

**Issue: Docker not starting on macOS**
```bash
# Solution: Increase Docker resources
# Docker Desktop > Preferences > Resources
# Set CPUs to 4+, Memory to 8GB+, Disk to 60GB+
```

**Issue: Supabase start fails**
```bash
# Solution: Check Docker daemon
docker ps
docker system prune -a

# Restart Supabase
supabase stop
supabase start
```

**Issue: npm install fails**
```bash
# Solution: Clear cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Issue: PostgreSQL connection refused**
```bash
# Solution: Start PostgreSQL service
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux
```

**Issue: AWS credentials not working**
```bash
# Solution: Verify credentials
aws sts get-caller-identity

# Reconfigure if needed
aws configure
```

---

## Support and Resources

### Documentation Links

- Supabase Docs: https://supabase.com/docs
- Expo Docs: https://docs.expo.dev
- React Native Paper: https://reactnativepaper.com
- Stedi Docs: https://www.stedi.com/docs
- AWS Secrets Manager: https://docs.aws.amazon.com/secretsmanager/

### Team Contacts

- Technical Lead: [Name/Email]
- DevOps Engineer: [Name/Email]
- HIPAA Compliance: [Name/Email]

### Support Channels

- Slack: #omnirapeutic-dev
- GitHub Issues: https://github.com/omnirapeutic/omnirapeutic-platform/issues
- Email: dev@omnirapeutic.com

---

**DEVELOPMENT SETUP GUIDE COMPLETE**

Last Updated: 2025-11-24
Version: 1.0
