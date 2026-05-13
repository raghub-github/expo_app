/**
 * One-time image compression script.
 * Converts all PNGs in public/img to WebP (80% quality) — ~75% size reduction.
 *
 * Run once: node scripts/compress-images.js
 * Requires: npm install -g sharp-cli  OR  npx sharp-cli
 *
 * After running, update all require('../public/img/foo.png') → require('../public/img/foo.webp')
 * using the rename step at the bottom of this script.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const IMG_DIR = path.join(__dirname, "..", "public", "img");

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function getTotalSize(dir, ext) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
}

console.log("=== GatiMitra Image Compressor ===\n");

// Check sharp is available
try {
  require.resolve("sharp");
} catch {
  console.log("Installing sharp...");
  execSync("npm install sharp --save-dev", { stdio: "inherit", cwd: path.join(__dirname, "..") });
}

const sharp = require("sharp");

const pngFiles = fs.readdirSync(IMG_DIR).filter((f) => f.endsWith(".png"));
console.log(`Found ${pngFiles.length} PNG files\n`);

const beforeTotal = getTotalSize(IMG_DIR, ".png");
console.log(`Total PNG size before: ${formatBytes(beforeTotal)}\n`);

let converted = 0;
let errors = [];

(async () => {
  for (const file of pngFiles) {
    const inputPath = path.join(IMG_DIR, file);
    const outputFile = file.replace(".png", ".webp");
    const outputPath = path.join(IMG_DIR, outputFile);

    const before = fs.statSync(inputPath).size;

    try {
      await sharp(inputPath)
        .webp({ quality: 82, effort: 6 })
        .toFile(outputPath);

      const after = fs.statSync(outputPath).size;
      const saving = (((before - after) / before) * 100).toFixed(0);
      console.log(`✓ ${file} → ${outputFile}  (${formatBytes(before)} → ${formatBytes(after)}, -${saving}%)`);
      converted++;
    } catch (err) {
      errors.push(file);
      console.error(`✗ ${file}: ${err.message}`);
    }
  }

  const afterTotal = getTotalSize(IMG_DIR, ".webp");
  const saved = beforeTotal - afterTotal;

  console.log(`\n=== Done ===`);
  console.log(`Converted: ${converted}/${pngFiles.length}`);
  console.log(`Before:    ${formatBytes(beforeTotal)}`);
  console.log(`After:     ${formatBytes(afterTotal)}`);
  console.log(`Saved:     ${formatBytes(saved)} (${(((saved) / beforeTotal) * 100).toFixed(0)}%)\n`);

  if (errors.length) {
    console.log("Failed:", errors.join(", "));
  }

  // Print the sed-style rename commands to update source code
  console.log("=== Next step: update require() calls in source code ===");
  console.log("Run this PowerShell command to rename all .png references to .webp:\n");
  console.log(
    `Get-ChildItem -Path . -Recurse -Include *.ts,*.tsx | ` +
    `ForEach-Object { (Get-Content $_.FullName) -replace 'public/img/(\\S+)\\.png', 'public/img/$1.webp' | Set-Content $_.FullName }\n`
  );
  console.log("Then delete the original PNGs (keep fav.png — used by app.json icon/splash):");
  console.log(`Get-ChildItem public\\img\\*.png | Where-Object { $_.Name -ne 'fav.png' } | Remove-Item\n`);
})();
