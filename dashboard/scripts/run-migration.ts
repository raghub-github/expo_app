/**
 * Migration Runner Script
 * Runs the dashboard access control migration (0042_dashboard_access_control.sql)
 */

import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  console.error("Please set DATABASE_URL or NEXT_PUBLIC_DATABASE_URL");
  process.exit(1);
}

async function runMigration() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  
  try {
    console.log("🔄 Starting migration: 0042_dashboard_access_control.sql");
    
    // Read migration file
    const migrationPath = path.join(process.cwd(), "drizzle", "0042_dashboard_access_control.sql");
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
    
    // Execute migration
    await sql.unsafe(migrationSQL);
    
    console.log("✅ Migration executed successfully");
    
    // Verify tables exist
    console.log("🔍 Verifying tables...");
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('dashboard_access', 'dashboard_access_points', 'action_audit_log')
      ORDER BY table_name;
    `;
    
    if (tables.length === 3) {
      console.log("✅ All 3 tables created successfully:");
      tables.forEach((t: any) => console.log(`   - ${t.table_name}`));
    } else {
      console.error(`❌ Expected 3 tables, found ${tables.length}`);
      console.error("Tables found:", tables.map((t: any) => t.table_name));
    }
    
    // Verify indexes
    console.log("🔍 Verifying indexes...");
    const indexes = await sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND (indexname LIKE 'dashboard_access%' OR indexname LIKE 'action_audit_log%')
      ORDER BY indexname;
    `;
    
    console.log(`✅ Found ${indexes.length} indexes`);
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
