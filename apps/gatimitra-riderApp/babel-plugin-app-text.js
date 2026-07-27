/**
 * Rewrite `import { Text } from "react-native"` → AppText (Lora letters / Poppins digits).
 */
module.exports = function riderAppTextPlugin({ types: t }) {
  return {
    name: "rider-app-text",
    visitor: {
      ImportDeclaration(path, state) {
        const filename = String(state.filename || state.file?.opts?.filename || "").replace(
          /\\/g,
          "/"
        );
        if (!filename) return;
        if (filename.includes("/node_modules/")) return;
        if (/\/AppText\.(tsx|ts|jsx|js)$/.test(filename)) return;
        if (filename.includes("/packages/") && !filename.includes("/gatimitra-riderApp/")) return;
        if (path.node.source.value !== "react-native") return;

        const textSpecs = [];
        const otherSpecs = [];
        for (const spec of path.node.specifiers) {
          if (
            t.isImportSpecifier(spec) &&
            t.isIdentifier(spec.imported) &&
            spec.imported.name === "Text"
          ) {
            textSpecs.push(spec);
          } else {
            otherSpecs.push(spec);
          }
        }
        if (textSpecs.length === 0) return;

        path.insertBefore(
          t.importDeclaration(
            textSpecs.map((spec) =>
              t.importSpecifier(spec.local, t.identifier("AppText"))
            ),
            t.stringLiteral("@/components/AppText")
          )
        );

        if (otherSpecs.length === 0) {
          path.remove();
        } else {
          path.node.specifiers = otherSpecs;
        }
      },
    },
  };
};
