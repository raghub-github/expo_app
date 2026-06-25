import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

const targets = [
  "app/dashboard/customers/[id]/edit/page.tsx",
  "app/dashboard/customers/[id]/page.tsx",
  "app/dashboard/riders/[id]/onboarding/RiderOnboardingClient.tsx",
  "app/dashboard/riders/[id]/page.tsx",
  "app/dashboard/users/[id]/access/page.tsx",
  "app/dashboard/users/[id]/page.tsx",
  "app/dashboard/users/roles/[id]/edit/page.tsx",
  "components/tickets/TicketsWorkspaceClient.tsx",
];

for (const rel of targets) {
  const file = path.join(root, rel);
  let next = fs.readFileSync(file, "utf8");
  next = next.replace(
    /import\s*\{([^}]*)\buseParams\b([^}]*)\}\s*from\s*["']next\/navigation["'];?/,
    (_, before, after) => {
      const kept = `${before}${after}`
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (kept.length === 0) return "";
      return `import { ${kept.join(", ")} } from "next/navigation";`;
    },
  );
  if (!next.includes('from "@/lib/navigation/use-app-params"')) {
    const appImport = 'import { useAppParams } from "@/lib/navigation/use-app-params";\n';
    const firstImport = next.search(/^import\s/m);
    next = next.slice(0, firstImport) + appImport + next.slice(firstImport);
  }
  next = next.replace(/\buseParams\s*\(/g, "useAppParams(");
  fs.writeFileSync(file, next);
  console.log("updated", rel);
}
