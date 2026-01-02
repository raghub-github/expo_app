/**
 * Script to check if database schema is properly set up
 * Run with: npx tsx backend/scripts/check-db-schema.ts
 */

import { getSql } from "../src/db/client.js";
import { loadEnv } from "../src/config/loadEnv.js";

async function checkSchema() {
  // Load environment variables
  loadEnv();

  const sql = getSql();

  try {
    console.log("Checking database schema...\n");

    // Check if riders table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'riders'
      );
    `;

    if (!tableCheck[0]?.exists) {
      console.error("❌ ERROR: 'riders' table does not exist!");
      console.log("\n📋 Solution:");
      console.log("1. Go to your Supabase project dashboard");
      console.log("2. Navigate to SQL Editor");
      console.log("3. Open: backend/drizzle/0002_enterprise_rider_schema.sql");
      console.log("4. Copy and paste the entire SQL file");
      console.log("5. Click 'Run' or press Ctrl+Enter\n");
      process.exit(1);
    }

    console.log("✅ 'riders' table exists");

    // Check if required enums exist
    const enumCheck = await sql`
      SELECT typname FROM pg_type 
      WHERE typname IN ('onboarding_stage', 'kyc_status', 'rider_status', 'document_type')
      AND typtype = 'e';
    `;

    const requiredEnums = ['onboarding_stage', 'kyc_status', 'rider_status', 'document_type'];
    const existingEnums = enumCheck.map((e: any) => e.typname);

    for (const enumName of requiredEnums) {
      if (existingEnums.includes(enumName)) {
        console.log(`✅ Enum '${enumName}' exists`);
      } else {
        console.error(`❌ ERROR: Enum '${enumName}' does not exist!`);
        console.log("   Please run the migration: backend/drizzle/0002_enterprise_rider_schema.sql\n");
        process.exit(1);
      }
    }

    // Check table structure
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'riders' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    console.log(`\n✅ Table 'riders' has ${columns.length} columns`);
    console.log("\n📊 Table structure:");
    columns.forEach((col: any) => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });

    console.log("\n✅ Database schema is properly set up!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error checking database schema:", error.message);
    console.error("\nThis might indicate:");
    console.error("1. Database connection issue");
    console.error("2. Missing DATABASE_URL in .env");
    console.error("3. Database permissions issue\n");
    process.exit(1);
  } finally {
    await sql.end();
  }
}

checkSchema();
