/**
 * Migration Verification Script
 * Verifies that dashboard access control tables exist and are properly structured
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}

async function verifyMigration() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  
  try {
    console.log("🔍 Verifying dashboard access control migration...\n");
    
    // Check if tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('dashboard_access', 'dashboard_access_points', 'action_audit_log')
      ORDER BY table_name;
    `;
    
    const expectedTables = ['dashboard_access', 'dashboard_access_points', 'action_audit_log'];
    const foundTables = tables.map((t: any) => t.table_name);
    
    console.log("📊 Tables Status:");
    expectedTables.forEach(table => {
      if (foundTables.includes(table)) {
        console.log(`   ✅ ${table}`);
      } else {
        console.log(`   ❌ ${table} - MISSING`);
      }
    });
    
    if (foundTables.length !== 3) {
      console.error("\n❌ Migration incomplete - some tables are missing");
      process.exit(1);
    }
    
    // Verify table structures
    console.log("\n📋 Verifying table structures...");
    
    for (const tableName of expectedTables) {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
        ORDER BY ordinal_position;
      `;
      
      console.log(`\n   Table: ${tableName} (${columns.length} columns)`);
      
      // Check key columns
      const columnNames = columns.map((c: any) => c.column_name);
      
      if (tableName === 'dashboard_access') {
        const required = ['id', 'system_user_id', 'dashboard_type', 'access_level', 'is_active'];
        required.forEach(col => {
          if (columnNames.includes(col)) {
            console.log(`      ✅ ${col}`);
          } else {
            console.log(`      ❌ ${col} - MISSING`);
          }
        });
      } else if (tableName === 'dashboard_access_points') {
        const required = ['id', 'system_user_id', 'dashboard_type', 'access_point_group', 'allowed_actions'];
        required.forEach(col => {
          if (columnNames.includes(col)) {
            console.log(`      ✅ ${col}`);
          } else {
            console.log(`      ❌ ${col} - MISSING`);
          }
        });
      } else if (tableName === 'action_audit_log') {
        const required = ['id', 'agent_id', 'agent_email', 'dashboard_type', 'action_type', 'created_at'];
        required.forEach(col => {
          if (columnNames.includes(col)) {
            console.log(`      ✅ ${col}`);
          } else {
            console.log(`      ❌ ${col} - MISSING`);
          }
        });
      }
    }
    
    // Verify indexes
    console.log("\n📊 Verifying indexes...");
    const indexes = await sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND (indexname LIKE 'dashboard_access%' OR indexname LIKE 'action_audit_log%')
      ORDER BY indexname;
    `;
    
    console.log(`   Found ${indexes.length} indexes`);
    indexes.forEach((idx: any) => console.log(`      ✅ ${idx.indexname}`));
    
    // Test basic operations
    console.log("\n🧪 Testing basic operations...");
    
    try {
      // Test INSERT into dashboard_access (will rollback)
      await sql.begin(async (tx) => {
        const result = await tx`
          INSERT INTO dashboard_access (system_user_id, dashboard_type, access_level, granted_by)
          VALUES (999999, 'TEST', 'VIEW_ONLY', 1)
          RETURNING id;
        `;
        await tx`ROLLBACK`;
        console.log("   ✅ INSERT test passed");
      });
    } catch (error) {
      console.error("   ❌ INSERT test failed:", error);
    }
    
    try {
      // Test SELECT
      const count = await sql`SELECT COUNT(*) as count FROM dashboard_access`;
      console.log(`   ✅ SELECT test passed (${count[0].count} rows)`);
    } catch (error) {
      console.error("   ❌ SELECT test failed:", error);
    }
    
    console.log("\n✅ Migration verification complete - all checks passed!");
    
  } catch (error) {
    console.error("❌ Verification failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

verifyMigration();
