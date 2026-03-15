// Check what progress rows exist
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local manually
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#][^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    process.env[key] = value;
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkProgress() {
  console.log('🔍 Checking all progress rows...\n');
  
  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get ALL progress rows
  const { data: allProgress, error: progressError } = await db
    .from('merchant_store_registration_progress')
    .select('*')
    .order('created_at', { ascending: false });

  if (progressError) {
    console.error('❌ Error:', progressError);
    process.exit(1);
  }

  console.log(`📊 Total progress rows: ${allProgress?.length || 0}\n`);

  if (!allProgress || allProgress.length === 0) {
    console.log('✅ No progress rows found');
    process.exit(0);
  }

  allProgress.forEach((p, i) => {
    console.log(`\n${i + 1}. Progress ID: ${p.id}`);
    console.log(`   Parent ID: ${p.parent_id}`);
    console.log(`   Store ID: ${p.store_id || 'NULL ⚠️'}`);
    console.log(`   Current Step: ${p.current_step}`);
    console.log(`   Completed Steps: ${p.completed_steps}`);
    console.log(`   Registration Status: ${p.registration_status}`);
    console.log(`   Created: ${new Date(p.created_at).toLocaleString()}`);
    console.log(`   Updated: ${new Date(p.updated_at).toLocaleString()}`);
  });

  // Now check stores for each parent
  const parentIds = [...new Set(allProgress.map(p => p.parent_id))];
  
  console.log('\n\n📦 Checking stores for each parent:\n');
  
  for (const parentId of parentIds) {
    const { data: stores } = await db
      .from('merchant_stores')
      .select('id, store_id, approval_status, current_onboarding_step, onboarding_completed')
      .eq('parent_id', parentId);

    console.log(`\nParent ${parentId}:`);
    if (!stores || stores.length === 0) {
      console.log('  No stores found');
      continue;
    }
    
    stores.forEach(s => {
      const incomplete = s.approval_status === 'DRAFT' || (s.current_onboarding_step < 9);
      console.log(`  - ${s.store_id}: ${s.approval_status}, step ${s.current_onboarding_step}${incomplete ? ' ⚠️ INCOMPLETE' : ' ✅'}`);
    });
  }
}

checkProgress().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
