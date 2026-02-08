/**
 * Database Connection Test Script
 * 
 * This script tests the database connection and queries the system_users table
 * to verify connectivity and table structure.
 * 
 * Usage: npx tsx scripts/test-db-connection.ts
 */

// Load environment variables from .env.local
import { readFileSync } from "fs";
import { join } from "path";

function loadEnvFile() {
  try {
    // Get the dashboard directory (current working directory when script runs)
    // Script should be run from dashboard directory: npm run test:db
    const envPath = join(process.cwd(), ".env.local");
    
    console.log(`📁 Looking for .env.local at: ${envPath}\n`);
    
    const envFile = readFileSync(envPath, "utf-8");
    const envVars = envFile.split("\n");
    let loadedCount = 0;
    
    for (const line of envVars) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim();
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, "");
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = cleanValue;
            loadedCount++;
          }
        }
      }
    }
    console.log(`✅ Loaded ${loadedCount} environment variable(s) from .env.local\n`);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error("❌ .env.local file not found!");
      console.error("\n💡 To fix this:");
      console.error("   1. Create a file named '.env.local' in the dashboard directory");
      console.error("   2. Add your environment variables:");
      console.error("      DATABASE_URL=postgresql://...");
      console.error("      NEXT_PUBLIC_SUPABASE_URL=https://...");
      console.error("      NEXT_PUBLIC_SUPABASE_ANON_KEY=...");
      console.error("      SUPABASE_SERVICE_ROLE_KEY=...");
      console.error("\n   See docs/COMPLETE_SETUP_GUIDE.md for details.\n");
    } else {
      console.error("❌ Failed to load .env.local file:", error.message);
    }
    process.exit(1);
  }
}

// Load env file before importing database client
loadEnvFile();

import { getDb } from "../src/lib/db/client";
import { systemUsers } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

async function testDatabaseConnection(): Promise<void> {
  console.log("🔍 Testing database connection...\n");

  try {
    // Test 1: Get database instance
    console.log("1️⃣  Getting database instance...");
    const db = getDb();
    console.log("   ✅ Database instance created\n");

    // Test 2: Simple query to test connection
    console.log("2️⃣  Testing connection with simple query...");
    const connectionTest = await db.execute(sql`SELECT NOW() as current_time`);
    console.log("   ✅ Connection successful!");
    console.log(`   📅 Server time: ${connectionTest[0].current_time}\n`);

    // Test 3: Check if system_users table exists
    console.log("3️⃣  Checking if system_users table exists...");
    const tableCheck = await db.execute(
      sql`SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_users'
      ) as table_exists`
    );
    const tableExists = tableCheck[0].table_exists;
    
    if (tableExists) {
      console.log("   ✅ Table 'system_users' exists\n");
    } else {
      console.log("   ❌ Table 'system_users' does not exist\n");
      return;
    }

    // Test 4: Count users in system_users table
    console.log("4️⃣  Counting users in system_users table...");
    const userCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(systemUsers);
    console.log(`   ✅ Total users: ${userCount[0].count}\n`);

    // Test 5: Get sample user data
    console.log("5️⃣  Fetching sample user data...");
    const sampleUsers = await db
      .select({
        id: systemUsers.id,
        system_user_id: systemUsers.systemUserId,
        email: systemUsers.email,
        full_name: systemUsers.fullName,
        primary_role: systemUsers.primaryRole,
        status: systemUsers.status,
      })
      .from(systemUsers)
      .limit(5);

    if (sampleUsers.length > 0) {
      console.log(`   ✅ Found ${sampleUsers.length} user(s):\n`);
      sampleUsers.forEach((user, index) => {
        console.log(`   User ${index + 1}:`);
        console.log(`      ID: ${user.id}`);
        console.log(`      System User ID: ${user.system_user_id}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Name: ${user.full_name}`);
        console.log(`      Role: ${user.primary_role}`);
        console.log(`      Status: ${user.status}`);
        console.log("");
      });
    } else {
      console.log("   ⚠️  No users found in system_users table\n");
    }

    // Test 6: Check for super admin
    console.log("6️⃣  Checking for SUPER_ADMIN users...");
    const superAdmins = await db
      .select({
        id: systemUsers.id,
        email: systemUsers.email,
        full_name: systemUsers.fullName,
        status: systemUsers.status,
      })
      .from(systemUsers)
      .where(sql`${systemUsers.primaryRole} = 'SUPER_ADMIN'`);

    if (superAdmins.length > 0) {
      console.log(`   ✅ Found ${superAdmins.length} SUPER_ADMIN user(s):\n`);
      superAdmins.forEach((admin, index) => {
        console.log(`   Admin ${index + 1}:`);
        console.log(`      Email: ${admin.email}`);
        console.log(`      Name: ${admin.full_name}`);
        console.log(`      Status: ${admin.status}`);
        console.log("");
      });
    } else {
      console.log("   ⚠️  No SUPER_ADMIN users found\n");
      console.log("   💡 Tip: Create a super admin using the SQL script in docs/create_super_admin.sql\n");
    }

    console.log("✅ All tests completed successfully!");
    console.log("\n📝 Summary:");
    console.log("   - Database connection: ✅ Working");
    console.log("   - system_users table: ✅ Exists");
    console.log(`   - Total users: ${userCount[0].count}`);
    console.log(`   - Super admins: ${superAdmins.length}`);

  } catch (error) {
    console.error("\n❌ Database connection test failed!\n");
    console.error("Error details:");
    console.error(error);

    if (error instanceof Error) {
      console.error("\nError message:", error.message);
      console.error("Error stack:", error.stack);
    }

    console.error("\n💡 Troubleshooting:");
    console.error("   1. Check DATABASE_URL in .env.local");
    console.error("   2. Verify database password is correct");
    console.error("   3. Ensure database is accessible from your network");
    console.error("   4. Check if using correct connection string format (pooler port 6543)");

    process.exit(1);
  }
}

// Run the test
testDatabaseConnection()
  .then(() => {
    console.log("\n✅ Test script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test script failed:", error);
    process.exit(1);
  });
