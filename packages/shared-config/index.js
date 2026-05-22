/**
 * @gatimitra/shared-config — entrypoint marker.
 *
 * The configs themselves are JSON / CJS files referenced via the `exports`
 * map in package.json:
 *
 *   {
 *     "extends": "@gatimitra/shared-config/tsconfig.base.json"
 *   }
 *
 * This file exists so `require("@gatimitra/shared-config")` works in tools
 * that don't honor the `exports` map.
 */
module.exports = {
  paths: {
    tsconfigBase: require.resolve("./tsconfig.base.json"),
    tsconfigNext: require.resolve("./tsconfig.next.json"),
    tsconfigExpo: require.resolve("./tsconfig.expo.json"),
    tsconfigNode: require.resolve("./tsconfig.node.json"),
    eslintBase: require.resolve("./eslint-base.cjs"),
    prettierBase: require.resolve("./prettier-base.json"),
  },
};
