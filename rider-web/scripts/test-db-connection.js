/**
 * Test Database Connection Script
 * This script tests different Supabase connection string formats
 * Run with: npm run test-db-connection
 */

const postgres = require('postgres');
const { readFileSync } = require('fs');
const { join } = require('path');

// Load .env.local
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env.local');
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        envVars[key.trim()] = value;
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('Error loading .env.local:', error.message);
    return {};
  }
}

const env = loadEnv();
// Extract project ref from DATABASE_URL
const dbUrl = env.DATABASE_URL || '';
const projectRef = dbUrl.match(/postgres\.([^.]+)@/)?.?.[1] || dbUrl.match(/@aws-[^-]+-([^.]+)\.pooler/)?.?.[1] || 'xjtvpdwngewpgvzmwqzt';
// Extract password from DATABASE_URL, but don't expose it in error messages
const password = dbUrl.match(/postgres(?:ql)?:\/\/[^:]+:([^@]+)@/)?.[1];
if (!password) {
  console.error('Error: Could not extract password from DATABASE_URL');
  console.error('Please ensure DATABASE_URL is set in .env.local');
  process.exit(1);
}

// Test different connection formats
const connectionFormats = [
  {
    name: 'Direct Connection (Port 5432)',
    url: `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`
  },
  {
    name: 'Connection Pooling (Port 6543) - Format 1',
    url: `postgresql://postgres:${password}@aws-0-${projectRef}.pooler.supabase.com:6543/postgres`
  },
  {
    name: 'Connection Pooling (Port 5432) - Format 2',
    url: `postgresql://postgres.${projectRef}:${password}@aws-0-${projectRef}.pooler.supabase.com:5432/postgres`
  },
  {
    name: 'Connection Pooling (Port 6543) - Format 3',
    url: `postgresql://postgres.${projectRef}:${password}@aws-0-${projectRef}.pooler.supabase.com:6543/postgres`
  }
];

async function testConnection(name, url) {
  console.log(`\nTesting: ${name}`);
  console.log(`URL: ${url.replace(/:[^:@]+@/, ':****@')}`);
  
  let client = null;
  try {
    client = postgres(url, { 
      max: 1, 
      ssl: 'require',
      connect_timeout: 5
    });
    
    const result = await client`SELECT version() as version`;
    console.log(`✅ SUCCESS! Connected to database.`);
    console.log(`Database version: ${result[0]?.version?.substring(0, 50)}...`);
    
    return { success: true, url };
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    if (error.cause) {
      console.log(`   Cause: ${error.cause.message || error.cause}`);
      if (error.cause.hostname) {
        console.log(`   Hostname: ${error.cause.hostname}`);
      }
    }
    return { success: false, error: error.message, url };
  } finally {
    // Ensure connection is closed in all cases
    if (client) {
      try {
        await client.end();
      } catch (closeError) {
        // Ignore errors when closing connection
        console.error('Error closing database connection:', closeError.message);
      }
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Supabase Database Connection Tester');
  console.log('='.repeat(60));
  console.log(`Project Reference: ${projectRef}`);
  console.log(`Testing ${connectionFormats.length} connection formats...`);
  
  const results = [];
  
  for (const format of connectionFormats) {
    const result = await testConnection(format.name, format.url);
    results.push(result);
    
    // If one succeeds, we can stop
    if (result.success) {
      console.log(`\n✅ Working connection found!`);
      console.log(`\nUpdate your .env.local with:`);
      console.log(`DATABASE_URL=${format.url}`);
      break;
    }
    
    // Small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const successful = results.find(r => r.success);
  
  if (!successful) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ None of the connection formats worked.');
    console.log('='.repeat(60));
    console.log('\nPlease get the EXACT connection string from Supabase Dashboard:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to Settings > Database');
    console.log('4. Under "Connection string", select "URI" format');
    console.log('5. Copy the connection string');
    console.log('6. Replace [YOUR-PASSWORD] with your database password');
    console.log('7. Update DATABASE_URL in .env.local');
    console.log('\nNote: Use "Connection pooling" mode for server-side connections.');
  }
}

main().catch(console.error);
