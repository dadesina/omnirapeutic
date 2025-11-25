# Development Environment Setup Guide (REVISED)

**Project:** Omnirapeutic
**Version:** 2.0 (Revised - All Critical Fixes Applied)
**Last Updated:** 2025-11-24
**Review Status:** ✅ Ready for Implementation

---

## Overview

This guide provides step-by-step instructions for setting up the complete development environment for Omnirapeutic, including local development tools, Supabase configuration, and the CI/CD pipeline.

**Estimated Setup Time:** 6-8 hours (first-time setup)

**Changes from v1.0:**
- ✅ Fixed deprecated expo-cli installation
- ✅ Fixed .gitignore blocking migrations
- ✅ Fixed Expo project creation
- ✅ Fixed environment variables for React Native
- ✅ Fixed CI/CD PostgreSQL conflicts
- ✅ Fixed migration commands
- ✅ Removed AWS credentials from .env
- ✅ Updated deprecated apt-key command
- ✅ Updated Docker Compose instructions
- ✅ Added Phase 1 migration integration
- ✅ Added missing configuration files

---

## Prerequisites

### Required Accounts

- [ ] GitHub account (for code repository)
- [ ] Supabase account (for database and backend)
- [ ] AWS account (for Secrets Manager and potential fallback hosting)
- [ ] OpenAI account (for Whisper API)
- [ ] Google Cloud account (for Gemini API)
- [ ] Stedi account (for EDI claims)
- [ ] Expo account (for mobile deployments)

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

**Ubuntu (FIXED - Modern approach):**
```bash
# Add PostgreSQL repository with modern GPG key handling
sudo apt-get install -y curl ca-certificates gnupg
curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | \
  sudo tee /etc/apt/keyrings/postgresql.gpg >/dev/null
sudo sh -c 'echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'

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

### 1.4 Install Expo CLI (FIXED - No global install needed)

```bash
# ✅ NO GLOBAL INSTALLATION NEEDED
# Expo CLI is now part of the expo package in node_modules
# We'll use npx to run Expo commands

# Install EAS CLI globally (for builds and deployments)
npm install -g eas-cli@latest

# Verify EAS installation
eas --version

# Note: We'll verify Expo CLI after project setup with: npx expo --version
```

### 1.5 Install GitHub CLI (NEW - for repository creation)

```bash
# macOS
brew install gh

# Ubuntu
type -p curl >/dev/null || sudo apt install curl -y
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh -y

# Authenticate with GitHub
gh auth login

# Verify
gh --version
```

### 1.6 Install Git

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

### 1.7 Install Docker (for local Supabase)

**macOS:**
```bash
# Download Docker Desktop from https://www.docker.com/products/docker-desktop
# Or install via Homebrew
brew install --cask docker

# Start Docker Desktop
open /Applications/Docker.app

# Verify
docker --version
docker compose version  # Note: 'docker compose' not 'docker-compose'
```

**Ubuntu (FIXED - Docker Compose v2):**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker Compose v2 plugin (installed with Docker)
docker --version
docker compose version  # Modern syntax, not docker-compose

# If docker compose doesn't work, install plugin manually:
# mkdir -p ~/.docker/cli-plugins/
# curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
# chmod +x ~/.docker/cli-plugins/docker-compose
```

### 1.8 Install VSCode and Extensions

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

# Create .gitignore (FIXED - Allows Supabase migrations)
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

# Editor directories (FIXED - Allow shared settings)
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Supabase - REMOVED .supabase/ to allow migrations
# The supabase/.gitignore will handle sensitive files

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
# Create repository on GitHub (via GitHub CLI)
gh repo create omnirapeutic/omnirapeutic-platform --private --source=. --remote=origin

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
# - supabase/.gitignore (handles sensitive files automatically)
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

### 2.4 Copy Phase 1 Database Migrations (NEW)

```bash
# Phase 1 already generated 12 migration files
# They should be in supabase/migrations/
# Verify they exist:
ls -lah supabase/migrations/

# You should see:
# 20251124000001_create_organizations.sql
# 20251124000002_create_providers.sql
# 20251124000003_create_patients.sql
# ... (12 files total)

# If migrations don't exist, they need to be copied from Phase 1 completion
```

### 2.5 Start Local Supabase and Apply Migrations

```bash
# Start Supabase (Docker required)
supabase start

# This will output:
# - API URL: http://localhost:54321
# - DB URL: postgresql://postgres:postgres@localhost:54322/postgres
# - Studio URL: http://localhost:54323
# - anon key: eyJ...
# - service_role key: eyJ...

# ⚠️ SAVE THESE CREDENTIALS!

# Apply Phase 1 migrations
supabase db reset

# Verify tables were created
supabase db status

# Open Supabase Studio to inspect
open http://localhost:54323

# Stop Supabase when done
supabase stop
```

### 2.6 Create Project Structure

```bash
# Create directory structure (FIXED - Separate commands)
mkdir -p apps/mobile/app
mkdir -p apps/mobile/app/_layout.tsx
mkdir -p apps/mobile/app/\(tabs\)
mkdir -p apps/mobile/components
mkdir -p apps/mobile/hooks
mkdir -p apps/mobile/lib
mkdir -p apps/mobile/types
mkdir -p apps/mobile/assets
mkdir -p packages/database
mkdir -p packages/shared
mkdir -p packages/api-client
mkdir -p supabase/functions
mkdir -p docs/architecture
mkdir -p docs/api
mkdir -p docs/guides
mkdir -p tests/unit
mkdir -p tests/integration
mkdir -p tests/e2e
mkdir -p tests/load

# Create package.json (workspace root)
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
    "format:check": "prettier --check .",
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

### 2.7 Create Mobile App (FIXED)

```bash
# Navigate to mobile app directory
cd apps/mobile

# Initialize Expo project in current directory
npx create-expo-app@latest . --template blank-typescript

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
npm install expo-constants  # NEW - For environment variables

# Return to root
cd ../..
```

### 2.8 Configure Mobile App (NEW - Required files)

**Create `apps/mobile/app.json`:**
```bash
cat > apps/mobile/app.json << 'EOF'
{
  "expo": {
    "name": "Omnirapeutic",
    "slug": "omnirapeutic",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.omnirapeutic.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.omnirapeutic.app"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "SUPABASE_URL": process.env.SUPABASE_URL,
      "SUPABASE_ANON_KEY": process.env.SUPABASE_ANON_KEY,
      "SENTRY_DSN": process.env.SENTRY_DSN,
      "DATADOG_CLIENT_TOKEN": process.env.DATADOG_CLIENT_TOKEN,
      "DATADOG_ENV": process.env.NODE_ENV,
      "DATADOG_APPLICATION_ID": process.env.DATADOG_APPLICATION_ID
    }
  }
}
EOF
```

**Create `apps/mobile/eas.json` (NEW - Required for deployments):**
```bash
cat > apps/mobile/eas.json << 'EOF'
{
  "cli": {
    "version": ">= 5.9.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "NODE_ENV": "development"
      }
    },
    "staging": {
      "distribution": "internal",
      "env": {
        "NODE_ENV": "staging"
      }
    },
    "production": {
      "env": {
        "NODE_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
EOF
```

**Update `apps/mobile/package.json`:**
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

### 2.9 Create Supabase Client (NEW - Required)

**Create `lib/supabase.ts` (CRITICAL - Missing in original guide):**
```bash
cat > lib/supabase.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import { Database } from './types/database';

const supabaseUrl = Constants.expoConfig?.extra?.SUPABASE_URL || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check app.json extra config.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
EOF
```

### 2.10 Configure Environment Variables (FIXED - No AWS credentials)

**Create `.env.example`:**
```bash
cat > .env.example << 'EOF'
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# AWS Region (credentials handled by ~/.aws/credentials)
AWS_REGION=us-east-1

# Note: API keys stored in AWS Secrets Manager
# Not in .env files for security
# Access via: aws secretsmanager get-secret-value --secret-id omnirapeutic/openai-api-key

# Environment
NODE_ENV=development

# Monitoring (optional for local dev)
SENTRY_DSN=
DATADOG_CLIENT_TOKEN=
DATADOG_APPLICATION_ID=
EOF

# Create actual .env (DO NOT COMMIT)
cp .env.example .env

# Edit .env with actual values
# nano .env
```

### 2.11 Configure TypeScript

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

### 2.12 Configure ESLint

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
    '@typescript-eslint/no-explicit-any': 'warn'  // Changed from 'error' to 'warn'
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};
```

### 2.13 Configure Prettier

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

### 2.14 Create VSCode Shared Settings (NEW)

**Create `.vscode/settings.json`:**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
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

**Create `.vscode/extensions.json`:**
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "supabase.supabase-vscode"
  ]
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

### 3.4 Configure Supabase Storage (FIXED)

**Create storage bucket and policies via migration:**

```bash
# Create migration for storage policies
supabase migration new create_storage_policies

# Edit the generated file: supabase/migrations/YYYYMMDDHHMMSS_create_storage_policies.sql
# Add the following SQL:
```

**Storage Policy SQL:**
```sql
-- Create storage bucket for voice notes
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', false);

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

```bash
# Apply migration locally
supabase db reset

# Push to production when ready
supabase db push
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

### 4.2 Configure AWS Credentials (FIXED - Secure method)

```bash
# Configure AWS CLI (stores credentials in ~/.aws/credentials)
aws configure

# Enter:
# AWS Access Key ID: [your access key]
# AWS Secret Access Key: [your secret key]
# Default region name: us-east-1
# Default output format: json

# Test configuration
aws sts get-caller-identity

# Verify credentials file (SECURE - not in .env)
cat ~/.aws/credentials
```

### 4.3 Create Secrets Manager Secrets (FIXED - Secure input)

```bash
# Create secret files (more secure than command history)
echo "sk-YOUR-OPENAI-KEY-HERE" > /tmp/openai-key.txt
echo "YOUR-GEMINI-KEY-HERE" > /tmp/gemini-key.txt
echo "YOUR-STEDI-KEY-HERE" > /tmp/stedi-key.txt
echo "eyJ-YOUR-SERVICE-ROLE-KEY-HERE" > /tmp/supabase-key.txt

# Store OpenAI API key
aws secretsmanager create-secret \
  --name omnirapeutic/openai-api-key \
  --description "OpenAI API key for Whisper transcription" \
  --secret-string "file:///tmp/openai-key.txt"

# Store Gemini API key
aws secretsmanager create-secret \
  --name omnirapeutic/gemini-api-key \
  --description "Google Gemini API key for SOAP note generation" \
  --secret-string "file:///tmp/gemini-key.txt"

# Store Stedi API key
aws secretsmanager create-secret \
  --name omnirapeutic/stedi-api-key \
  --description "Stedi API key for EDI claims" \
  --secret-string "file:///tmp/stedi-key.txt"

# Store Supabase service role key
aws secretsmanager create-secret \
  --name omnirapeutic/supabase-service-role-key \
  --description "Supabase service role key for admin operations" \
  --secret-string "file:///tmp/supabase-key.txt"

# Clean up temporary files
rm /tmp/openai-key.txt /tmp/gemini-key.txt /tmp/stedi-key.txt /tmp/supabase-key.txt

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

### 5.1 GitHub Actions Configuration (FIXED)

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
        run: npm run format:check

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
    # FIXED: Removed conflicting PostgreSQL service
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

      - name: Run migrations (FIXED)
        run: supabase db reset

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
        run: cd apps/mobile && npx expo export --platform all

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
AWS_ACCESS_KEY_ID               # For AWS deployments (if needed)
AWS_SECRET_ACCESS_KEY           # For AWS deployments (if needed)
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
    'lib/**/*.{ts,tsx}',
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

## Part 6: Monitoring and Observability (FIXED)

### 6.1 Sentry Setup (Error Tracking)

```bash
# Install Sentry
npm install @sentry/react-native

# Initialize Sentry in app
npx @sentry/wizard -i reactNative -p ios android
```

**Configure Sentry (`apps/mobile/App.tsx`) - FIXED:**
```typescript
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

Sentry.init({
  dsn: Constants.expoConfig?.extra?.SENTRY_DSN,
  environment: Constants.expoConfig?.extra?.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
  enableAutoSessionTracking: true,
  sessionTrackingIntervalMillis: 30000,
});

export default Sentry.wrap(App);
```

### 6.2 Datadog Setup (APM) - FIXED

```bash
# Install Datadog
npm install @datadog/mobile-react-native
```

**Configure Datadog:**
```typescript
import { DdSdkReactNative, DdSdkReactNativeConfiguration } from '@datadog/mobile-react-native';
import Constants from 'expo-constants';

const config = new DdSdkReactNativeConfiguration(
  Constants.expoConfig?.extra?.DATADOG_CLIENT_TOKEN!,
  Constants.expoConfig?.extra?.NODE_ENV || 'development',
  Constants.expoConfig?.extra?.DATADOG_APPLICATION_ID!,
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
mkdir -p scripts
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

# Check EAS CLI
if command -v eas &> /dev/null; then
  echo "✓ EAS CLI installed: $(eas --version)"
else
  echo "✗ EAS CLI not found"
  exit 1
fi

# Check Expo (via npx)
if npx expo --version &> /dev/null; then
  echo "✓ Expo CLI available: $(npx expo --version)"
else
  echo "✗ Expo CLI not available"
  exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
  echo "✓ Docker installed: $(docker --version)"
else
  echo "✗ Docker not found"
  exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
  echo "✓ Docker Compose installed: $(docker compose version)"
else
  echo "✗ Docker Compose not found"
  exit 1
fi

# Check Git
if command -v git &> /dev/null; then
  echo "✓ Git installed: $(git --version)"
else
  echo "✗ Git not found"
  exit 1
fi

# Check GitHub CLI
if command -v gh &> /dev/null; then
  echo "✓ GitHub CLI installed: $(gh --version | head -n 1)"
else
  echo "✗ GitHub CLI not found"
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

# Check Supabase local (FIXED)
if supabase status 2>/dev/null | grep -q "supabase local development"; then
  echo "✓ Supabase is running"
else
  echo "⚠ Supabase is not running (run 'supabase start')"
fi

# Check migrations
MIGRATION_COUNT=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l)
if [ "$MIGRATION_COUNT" -ge 12 ]; then
  echo "✓ Phase 1 migrations present ($MIGRATION_COUNT files)"
else
  echo "⚠ Expected 12+ migration files, found $MIGRATION_COUNT"
fi

echo ""
echo "✓ Development environment verification complete!"
EOF

chmod +x scripts/verify-setup.sh
./scripts/verify-setup.sh
```

### CI/CD Pipeline Verification

```bash
# Test CI pipeline locally (optional - requires act)
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
- [ ] Verify Phase 1 migrations are applied
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
# Docker Desktop > Settings > Resources
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

**Issue: Expo app won't start**
```bash
# Solution: Clear Expo cache
cd apps/mobile
rm -rf .expo node_modules
npm install
npx expo start --clear
```

**Issue: Environment variables not loading in React Native**
```bash
# Solution: Verify app.json extra config
# Restart metro bundler
npx expo start --clear
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

## Summary of Fixes Applied

### Critical Fixes ✅
1. ✅ Removed deprecated expo-cli global installation
2. ✅ Fixed .gitignore to allow Supabase migrations
3. ✅ Fixed Expo project creation in existing directory
4. ✅ Fixed environment variables for React Native (using expo-constants)
5. ✅ Removed conflicting PostgreSQL service from CI
6. ✅ Fixed migration command in CI (db reset not db push)

### High Priority Fixes ✅
7. ✅ Removed AWS credentials from .env (using ~/.aws/credentials)
8. ✅ Updated deprecated apt-key command
9. ✅ Updated Docker Compose to v2 syntax
10. ✅ Added storage policy migration instructions

### New Additions ✅
11. ✅ Added Phase 1 migration integration section
12. ✅ Added eas.json configuration
13. ✅ Added app.json configuration
14. ✅ Added lib/supabase.ts client initialization
15. ✅ Added GitHub CLI installation
16. ✅ Added VSCode shared settings
17. ✅ Improved verification script
18. ✅ Updated time estimate (6-8 hours)

---

**DEVELOPMENT SETUP GUIDE COMPLETE - VERSION 2.0**

Last Updated: 2025-11-24
Status: ✅ READY FOR IMPLEMENTATION
Review Status: All critical and high-priority issues resolved
