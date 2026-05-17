import fs from "fs";

const overviewPath =
  "c:/Users/HP/OneDrive/Desktop/expo_app/dashboard/src/app/dashboard/merchants/stores/[id]/StoreOverviewDashboard.tsx";

const cardBlock = `        <section className="min-w-0 flex flex-col h-full">
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
            storeIdLabel={storeFromHook?.store_id ?? null}
            manualActivationLock={statusCard.manualActivationLock}
            showScheduledOffStartsCountdown={statusCard.showScheduledOffStartsCountdown}
            scheduledOffStartsInMs={statusCard.scheduledOffStartsInMs}
            onStoreToggle={() => storeOps.handleStoreToggle({ isDelisted })}
            onManualLockChange={(enabled) => {
              statusCard.setManualActivationLock(enabled);
              void storeOps.saveManualActivationLock(enabled);
            }}
          />
        </section>
`;

let overview = fs.readFileSync(overviewPath, "utf8");
const anchor = "rounded-xl border-2 p-4 shadow-sm";
const startIdx = overview.indexOf(anchor);
const realStart = overview.lastIndexOf("        <", startIdx);
const endIdx = overview.indexOf('border-gray-200/80 bg-white p-4 shadow-sm"');
const endLine = overview.lastIndexOf("        <", endIdx);

if (realStart < 0 || endLine < 0 || endLine <= realStart) {
  console.error("markers not found", realStart, endLine);
  process.exit(1);
}

overview = overview.slice(0, realStart) + cardBlock + "\n\n" + overview.slice(endLine);
overview = overview.replace(/\n  Power,\n/, "\n");

if (!overview.includes("const isDelisted")) {
  overview = overview.replace(
    "  const statusCard = useStoreStatusCardModel",
    `  const isDelisted = ((storeFromHook?.approval_status || "").toUpperCase() === "DELISTED");\n\n  const statusCard = useStoreStatusCardModel`
  );
}

fs.writeFileSync(overviewPath, overview);
console.log("Patched StoreOverviewDashboard");
