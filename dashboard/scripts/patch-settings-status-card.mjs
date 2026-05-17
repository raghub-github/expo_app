import fs from "fs";

const path =
  "c:/Users/HP/OneDrive/Desktop/expo_app/dashboard/src/app/dashboard/merchants/stores/[id]/store-settings/StoreSettingsClient.tsx";

const cardBlock = `              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <MerchantStoreStatusCard
                    isStoreOpen={statusCard.isStoreOpen}
                    restrictionType={statusCard.restrictionType}
                    storeStatusBadge={statusCard.storeStatusBadge}
                    cardDisplaySlots={statusCard.cardDisplaySlots}
                    cardBreakGapLabel={statusCard.cardBreakGapLabel}
                    scheduledTimeOffs={statusCard.scheduledTimeOffs}
                    formatScheduledTimeOffWindow={statusCard.formatScheduledTimeOffWindow}
                    isTodayScheduledClosed={statusCard.isTodayScheduledClosed}
                    scheduleStatusLabel={statusCard.scheduleStatusLabel}
                    schedulePhase={statusCard.schedulePhase}
                    showScheduleCountdown={statusCard.showScheduleCountdown}
                    activeCountdownAt={statusCard.activeCountdownAt}
                    countdownTick={statusCard.countdownTick}
                    opensCountdownLabel={statusCard.opensCountdownLabel}
                    countdownKind={statusCard.countdownKind}
                    countdownSubtitleWallLabel={statusCard.countdownSubtitleWallLabel}
                    closeReasonDisplay={statusCard.closeReasonDisplay}
                    lastToggledByName={statusCard.lastToggledByName}
                    lastToggleBy={statusCard.lastToggleBy}
                    lastToggleType={statusCard.lastToggleType}
                    lastToggledAt={statusCard.lastToggledAt}
                    storeIdLabel={effectiveStore?.store_id ?? null}
                    manualActivationLock={statusCard.manualActivationLock}
                    showScheduledOffStartsCountdown={statusCard.showScheduledOffStartsCountdown}
                    scheduledOffStartsInMs={statusCard.scheduledOffStartsInMs}
                    onStoreToggle={() => handleStoreToggle({ isDelisted })}
                    onManualLockChange={(enabled) => {
                      statusCard.setManualActivationLock(enabled);
                      void saveManualActivationLock(enabled);
                    }}
                  />
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Order handling</h3>
                  <p className="mt-0.5 text-xs text-gray-500 mb-3">Auto-accept and preparation buffer.</p>
                  <motionless className="space-y-3">
`;

const cardBlockFixed = cardBlock.replace(/motionless/g, "div");

let s = fs.readFileSync(path, "utf8");
const anchor = "Store status & operations";
const startAnchor = s.indexOf(anchor);
const realStart = s.lastIndexOf("              <", startAnchor);
const endAnchor = "Right: Delist / Relist card";
const endAnchorIdx = s.indexOf(endAnchor, startAnchor);
const endLine = s.lastIndexOf("              <", endAnchorIdx);

if (realStart < 0 || endLine < 0) {
  console.error("not found", realStart, endLine);
  process.exit(1);
}

s = s.slice(0, realStart) + cardBlockFixed + s.slice(endLine);
fs.writeFileSync(path, s);
console.log("Patched settings");
