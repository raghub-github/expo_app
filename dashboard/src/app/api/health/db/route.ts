/**
 * Database Health Check API
 * GET /api/health/db - Check database connection and access control tables
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const checks: Record<string, boolean | string> = {};

    // Check database connection
    try {
      await db.execute(sql`SELECT 1`);
      checks.database_connection = true;
    } catch (error) {
      checks.database_connection = false;
      checks.database_error = error instanceof Error ? error.message : "Unknown error";
    }

    // Check if access control tables exist
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('dashboard_access', 'dashboard_access_points', 'action_audit_log')
      ORDER BY table_name;
    `);

    const tableNames = (tables.rows || []).map((row: any) => row.table_name);
    
    checks.dashboard_access_table = tableNames.includes('dashboard_access');
    checks.dashboard_access_points_table = tableNames.includes('dashboard_access_points');
    checks.action_audit_log_table = tableNames.includes('action_audit_log');

    // Check if indexes exist
    const indexes = await db.execute(sql`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND (indexname LIKE 'dashboard_access%' OR indexname LIKE 'action_audit_log%')
      ORDER BY indexname;
    `);

    checks.indexes_count = (indexes.rows || []).length;

    // Overall status
    const allTablesExist = 
      checks.dashboard_access_table === true &&
      checks.dashboard_access_points_table === true &&
      checks.action_audit_log_table === true;

    const isHealthy = checks.database_connection === true && allTablesExist;

    return NextResponse.json({
      success: isHealthy,
      status: isHealthy ? "healthy" : "unhealthy",
      checks,
      timestamp: new Date().toISOString(),
    }, {
      status: isHealthy ? 200 : 503
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, {
      status: 500
    });
  }
}
