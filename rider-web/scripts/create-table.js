/**
 * Script to create the reviews table in Supabase
 * Run this with: npm run create-reviews-table
 * 
 * Make sure DATABASE_URL is set in your .env.local file
 */

const postgres = require('postgres');
const { readFileSync } = require('fs');
const { join } = require('path');

// Load environment variables from .env.local manually
function loadEnv() {
  try {
    const envContent = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  } catch (error) {
    console.warn('Could not load .env.local:', error.message);
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is not set in .env.local');
  console.log('\nPlease add DATABASE_URL to your .env.local file:');
  console.log('DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres\n');
  process.exit(1);
}

async function createTable() {
  const client = postgres(DATABASE_URL, {
    max: 1,
    ssl: 'require',
  });

  try {
    console.log('🔌 Connecting to database...');
    
    // Read migration SQL
    const migrationSQL = readFileSync(
      join(process.cwd(), 'migrations', 'create_reviews_table.sql'),
      'utf-8'
    );

    console.log('📝 Executing migration SQL...');
    await client.unsafe(migrationSQL);

    console.log('✅ Successfully created reviews table!');
    
    // Verify table exists
    const result = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'reviews'
      );
    `;

    if (result[0].exists) {
      console.log('✅ Verified: reviews table exists');
      
      // Get column info
      const columns = await client`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'reviews' 
        ORDER BY ordinal_position;
      `;
      
      console.log('\n📊 Table structure:');
      columns.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });
    }

    await client.end();
    console.log('\n🎉 Setup complete! You can now use the reviews feature.');
  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    if (error.code === '42P07') {
      console.log('ℹ️  Table already exists (this is okay)');
    } else {
      console.error('Error details:', error);
      process.exit(1);
    }
  }
}

createTable();

