import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const context = url.searchParams.get("context") ?? "all";

    const root = process.cwd();
    const filePath = path.join(root, "docs", "CX_CS_INSTRUCTIONS_TEMPLATE.md");

    const content = await fs.readFile(filePath, "utf8");

    return NextResponse.json({
      success: true,
      context,
      content,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load CX instructions", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load CX instructions.",
      },
      { status: 500 },
    );
  }
}

