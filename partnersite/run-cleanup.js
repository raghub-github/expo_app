// Quick script to clean up stale progress rows
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

async function cleanup() {
  console.log('🔧 Starting cleanup of stale progress rows...\n');
  
  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get all progress rows with store_id = null and registration_status != COMPLETED
  const { data: staleProgress, error: progressError } = await db
    .from('merchant_store_registration_progress')
    .select('id, parent_id, current_step, registration_status')
    .is('store_id', null)
    .neq('registration_status', 'COMPLETED');

  if (progressError) {
    console.error('❌ Error fetching progress rows:', progressError);
    process.exit(1);
  }

  console.log(`📊 Found ${staleProgress?.length || 0} progress rows with store_id = null\n`);

  if (!staleProgress || staleProgress.length === 0) {
    console.log('✅ No stale progress rows found. Database is clean!');
    process.exit(0);
  }

  let cleanedCount = 0;

  // For each stale progress row, check if the parent has any incomplete stores
  for (const progress of staleProgress) {
    console.log(`\n🔍 Checking parent_id: ${progress.parent_id}`);
    console.log(`   Progress: step ${progress.current_step}, status: ${progress.registration_status}`);
    
    const { data: stores } = await db
      .from('merchant_stores')
      .select('id, store_id, approval_status, current_onboarding_step, onboarding_completed')
      .eq('parent_id', progress.parent_id);

    if (!stores || stores.length === 0) {
      console.log('   ⚠️  No stores found for this parent - skipping');
      continue;
    }

    console.log(`   📦 Found ${stores.length} store(s):`);
    stores.forEach(s => {
      console.log(`      - ${s.store_id}: status=${s.approval_status}, step=${s.current_onboarding_step}`);
    });

    // Check if there are any incomplete stores
    const hasIncompleteStore = stores.some((s) => {
      const isDraft = (s.approval_status || '').toUpperCase() === 'DRAFT';
      const isIncomplete = typeof s.current_onboarding_step === 'number' && s.current_onboarding_step < 9;
      return isDraft || isIncomplete;
    });

    if (hasIncompleteStore) {
      console.log('   ⚠️  Has incomplete stores - keeping progress row');
      continue;
    }

    // If no incomplete stores, mark the progress as COMPLETED
    console.log('   ✅ All stores complete - marking progress as COMPLETED');
    
    const { error: updateError } = await db
      .from('merchant_store_registration_progress')
      .update({
        registration_status: 'COMPLETED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', progress.id);

    if (updateError) {
      console.error('   ❌ Error updating progress:', updateError);
    } else {
      cleanedCount++;
      console.log('   ✅ Progress marked as COMPLETED');
    }
  }

  console.log(`\n\n🎉 Cleanup complete! Marked ${cleanedCount} progress rows as COMPLETED`);
  console.log('\n📝 Next steps:');
  console.log('   1. Refresh your browser at http://localhost:3000/auth/post-login');
  console.log('   2. The "Incomplete onboarding draft" banner should be gone');
  console.log('   3. If it still appears, check the console logs above for issues\n');
}

cleanup().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
