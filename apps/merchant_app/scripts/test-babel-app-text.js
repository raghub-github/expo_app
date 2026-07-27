const babel = require("@babel/core");
const plugin = require("../babel-plugin-app-text");
const src = `import { View, Text } from 'react-native';
export const X = () => <Text>Hi 12</Text>;`;

for (const filename of [
  "C:/Users/HP/OneDrive/Desktop/expo_app/apps/merchant_app/app/(tabs)/index.tsx",
  "app/(tabs)/index.tsx",
  "C:\\Users\\HP\\OneDrive\\Desktop\\expo_app\\apps\\merchant_app\\app\\(tabs)\\index.tsx",
]) {
  const r = babel.transformSync(src, {
    filename,
    presets: ["babel-preset-expo"],
    plugins: [plugin],
    babelrc: false,
    configFile: false,
  });
  const hit = r.code.includes("AppText");
  console.log(JSON.stringify(filename), "→ AppText?", hit);
  if (!hit) console.log(r.code.slice(0, 300));
}
