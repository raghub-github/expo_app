import fs from "fs";

const p =
  "c:/Users/HP/OneDrive/Desktop/expo_app/dashboard/src/app/dashboard/merchants/stores/[id]/store-settings/StoreSettingsClient.tsx";
let s = fs.readFileSync(p, "utf8");
const needle2 =
  '              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">\n                              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">';
if (s.includes(needle2)) {
  s = s.replace(needle2, '              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">'.replace(
    /motionless/g,
    "div"
  ));
}
s = s.replace("                </div>\n{/* Right:", "                </div>\n\n                {/* Right:");
fs.writeFileSync(p, s);
console.log("fixed dup grid");
