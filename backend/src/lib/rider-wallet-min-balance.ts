/**
 * Rider wallet balance rule — re-exported from @gatimitra/financial-rules so the
 * backend and the dashboard evaluate it with the same code.
 *
 * A rider is ACTIVE while the wallet balance is ABOVE the Super Admin floor
 * (ride_wallet_config.global_block_threshold, default −₹200). At or below it,
 * every service is paused until the balance is back above the floor.
 *
 * The former positive "minimum wallet balance" (₹200, Ride + Parcel) is retired:
 * `neutralMinBalanceStatus` keeps the `walletMinBalance` API field's shape for
 * installed apps while never restricting anything.
 */
export {
  DEFAULT_WALLET_ACTIVE_FLOOR,
  MIN_BALANCE_RESTRICTED_SERVICES,
  WALLET_ENGINE_BLOCK_REASONS,
  evaluateWalletFloor,
  formatSignedRupees,
  isWalletAtOrBelowFloor,
  neutralMinBalanceStatus,
  normalizeWalletActiveFloor,
  resolveWalletBlockState,
  walletUnlockAmount,
  type MinBalanceMode,
  type MinBalanceRestrictedService,
  type RiderMinBalanceStatus,
  type StoredWalletBlock,
  type WalletFloorStatus,
} from "@gatimitra/financial-rules";
