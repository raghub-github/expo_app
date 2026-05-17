import fs from "fs";

const path =
  "c:/Users/HP/OneDrive/Desktop/expo_app/dashboard/src/app/dashboard/merchants/stores/[id]/store-settings/StoreSettingsClient.tsx";

let fixed = fs.readFileSync(
  "c:/Users/HP/OneDrive/Desktop/expo_app/dashboard/scripts/fix-settings-ops-block.txt",
  "utf8"
);

let s = fs.readFileSync(path, "utf8");
const start = s.indexOf('              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">');
const startDiv = s.indexOf('              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">');
const realStart = Math.max(
  s.indexOf('              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">'),
  s.indexOf('              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">')
);
const useStart =
  s.indexOf('              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">') >= 0
    ? s.indexOf('              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">')
    : s.indexOf('              <motionless className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">');
