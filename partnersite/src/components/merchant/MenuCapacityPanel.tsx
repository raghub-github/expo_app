'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ChefHat,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  Lock,
  Save,
  SlidersHorizontal,
  Store,
} from 'lucide-react';

export type PlanUsageSnapshot = {
  totalItems?: number;
  unlockedItems: number;
  lockedItems: number;
  lockedCategories: number;
  planLockingSupported: boolean;
};

export type MenuCapacityPanelProps = {
  currentMenuItemsCount: number;
  maxMenuItems: number | null;
  currentCuisinesCount: number;
  maxCuisines: number | null;
  imageUploadAllowed: boolean;
  planUsage: PlanUsageSnapshot | null;
  planUsageLoading?: boolean;
  isSaving: boolean;
  onSave: () => void;
  onUpgradePlan: () => void;
};

function PanelIcon({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}

function CapacityCard({
  icon,
  iconClassName,
  title,
  description,
  countLabel,
  countClassName,
  progressPercent,
  progressClassName,
  limitReached,
  limitMessage,
  footerNote,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
  countLabel: string;
  countClassName: string;
  progressPercent: number | null;
  progressClassName: string;
  limitReached?: boolean;
  limitMessage?: string;
  footerNote?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <PanelIcon className={iconClassName}>{icon}</PanelIcon>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{title}</p>
            <p className="mt-0.5 text-sm leading-snug text-gray-500">{description}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${countClassName}`}
        >
          {countLabel}
        </span>
      </div>
      {progressPercent != null ? (
        <div className="px-5 pb-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressClassName}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {footerNote ? (
            <p className="mt-2 text-xs font-medium text-gray-600">{footerNote}</p>
          ) : null}
          {limitReached && limitMessage ? (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
              <Lock size={12} aria-hidden />
              {limitMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StoreImpactBanner({
  planUsage,
  maxMenuItems,
  currentMenuItemsCount,
  menuLimitReached,
  planUsageLoading,
}: {
  planUsage: PlanUsageSnapshot | null;
  maxMenuItems: number | null;
  currentMenuItemsCount: number;
  menuLimitReached: boolean;
  planUsageLoading?: boolean;
}) {
  const lockedItems = planUsage?.lockedItems ?? 0;
  const unlockedItems = planUsage?.unlockedItems ?? 0;
  const totalItems = planUsage?.totalItems ?? currentMenuItemsCount;
  const effectiveLocked =
    lockedItems > 0
      ? lockedItems
      : maxMenuItems != null && totalItems > maxMenuItems
        ? totalItems - maxMenuItems
        : 0;
  const liveItems = unlockedItems > 0 ? unlockedItems : Math.max(0, totalItems - effectiveLocked);

  const showBanner =
    menuLimitReached || effectiveLocked > 0 || (planUsageLoading && !planUsage);

  if (!showBanner) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5">
      <div className="flex items-start gap-3">
        <PanelIcon className="bg-amber-100 text-amber-700">
          <AlertTriangle size={20} strokeWidth={2} />
        </PanelIcon>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">What happens on your store</p>
          {planUsageLoading && !planUsage ? (
            <p className="mt-1 text-sm text-gray-600">Checking plan limits…</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm text-gray-800">
              {effectiveLocked > 0 ? (
                <li>
                  <div className="flex items-start gap-2">
                    <Lock size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
                    <div>
                      <p className="font-semibold text-gray-900">
                        {effectiveLocked} menu item{effectiveLocked === 1 ? '' : 's'} locked right now
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                        Your newest items beyond the plan limit are auto-locked — hidden from
                        customers on the GatiMitra app and your public store page.
                      </p>
                    </div>
                  </div>
                </li>
              ) : null}

              {(effectiveLocked > 0 || menuLimitReached) && maxMenuItems != null ? (
                <li>
                  <div className="flex items-start gap-2">
                    <Store size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
                    <div>
                      <p className="font-semibold text-gray-900">
                        {liveItems} live · {totalItems} total on your menu
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                        Your plan allows {maxMenuItems} active item{maxMenuItems === 1 ? '' : 's'}.
                        {effectiveLocked > 0
                          ? ` Your newest ${effectiveLocked} item${effectiveLocked === 1 ? '' : 's'} beyond the limit ${effectiveLocked === 1 ? 'is' : 'are'} locked and unavailable for editing or stock updates.`
                          : ' You are at capacity.'}
                      </p>
                    </div>
                  </div>
                </li>
              ) : null}

              {menuLimitReached ? (
                <li>
                  <div className="flex items-start gap-2">
                    <EyeOff size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
                    <div>
                      <p className="font-semibold text-gray-900">
                        You cannot add new menu items
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                        Your plan limit of {maxMenuItems ?? liveItems} item
                        {(maxMenuItems ?? liveItems) === 1 ? '' : 's'} is reached
                        {effectiveLocked > 0
                          ? ` — ${effectiveLocked} existing item${effectiveLocked === 1 ? ' is' : 's are'} already locked. Upgrade your plan to unlock more items or add new ones.`
                          : '. Upgrade your plan to increase your menu capacity.'}
                      </p>
                    </div>
                  </div>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function MenuCapacityPanel({
  currentMenuItemsCount,
  maxMenuItems,
  currentCuisinesCount,
  maxCuisines,
  imageUploadAllowed,
  planUsage,
  planUsageLoading = false,
  isSaving,
  onSave,
  onUpgradePlan,
}: MenuCapacityPanelProps) {
  const unlockedItems = planUsage?.unlockedItems ?? currentMenuItemsCount;
  const lockedItems = planUsage?.lockedItems ?? 0;
  const menuLimitReached =
    maxMenuItems != null && maxMenuItems > 0 && currentMenuItemsCount >= maxMenuItems;
  const cuisineLimitReached =
    maxCuisines != null && maxCuisines > 0 && currentCuisinesCount >= maxCuisines;

  const menuProgress =
    maxMenuItems != null && maxMenuItems > 0
      ? Math.min((currentMenuItemsCount / maxMenuItems) * 100, 100)
      : null;
  const cuisineProgress =
    maxCuisines != null && maxCuisines > 0
      ? Math.min((currentCuisinesCount / maxCuisines) * 100, 100)
      : null;

  const menuCountLabel =
    lockedItems > 0
      ? `${unlockedItems} live / ${currentMenuItemsCount} total`
      : `${currentMenuItemsCount} / ${maxMenuItems ?? '∞'}`;

  return (
    <div className="rounded-xl bg-[#F9FAFB] p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <PanelIcon className="bg-emerald-50 text-emerald-700">
            <SlidersHorizontal size={20} strokeWidth={2} />
          </PanelIcon>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 sm:text-xl">Menu &amp; Capacity Controls</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
              Manage your menu items, cuisines and media capacity limits.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} strokeWidth={2.25} />
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-4">
        <StoreImpactBanner
          planUsage={planUsage}
          maxMenuItems={maxMenuItems}
          currentMenuItemsCount={currentMenuItemsCount}
          menuLimitReached={menuLimitReached}
          planUsageLoading={planUsageLoading}
        />

        <CapacityCard
          icon={<FileText size={20} strokeWidth={2} />}
          iconClassName="bg-emerald-50 text-emerald-700"
          title="Menu Items"
          description="Add and manage your menu items."
          countLabel={menuCountLabel}
          countClassName={
            menuLimitReached
              ? 'bg-red-50 text-red-700'
              : 'bg-emerald-50 text-emerald-700'
          }
          progressPercent={menuProgress}
          progressClassName={menuLimitReached ? 'bg-red-500' : 'bg-emerald-500'}
          limitReached={menuLimitReached}
          limitMessage="Limit reached. Upgrade plan to add more items."
          footerNote={
            lockedItems > 0
              ? `${lockedItems} item${lockedItems === 1 ? '' : 's'} locked · plan allows ${maxMenuItems ?? '∞'} active`
              : undefined
          }
        />

        <CapacityCard
          icon={<ChefHat size={20} strokeWidth={2} />}
          iconClassName="bg-violet-50 text-violet-700"
          title="Cuisines"
          description="Add and manage cuisines for your store."
          countLabel={`${currentCuisinesCount} / ${maxCuisines ?? '∞'}`}
          countClassName={
            cuisineLimitReached
              ? 'bg-red-50 text-red-700'
              : 'bg-violet-50 text-violet-700'
          }
          progressPercent={cuisineProgress}
          progressClassName={cuisineLimitReached ? 'bg-red-500' : 'bg-violet-500'}
          limitReached={cuisineLimitReached}
          limitMessage="Limit reached. Upgrade plan to add more cuisines."
        />

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <PanelIcon className="bg-orange-50 text-orange-600">
              <ImageIcon size={20} strokeWidth={2} />
            </PanelIcon>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">Image Uploads</p>
              <p className="mt-0.5 text-sm leading-snug text-gray-500">
                Upload images for your menu items.
              </p>
            </div>
          </div>
          {imageUploadAllowed ? (
            <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              ✓ Enabled
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
              <Lock size={14} aria-hidden />
              Locked
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <PanelIcon className="bg-emerald-100 text-emerald-700">
              <Lightbulb size={20} strokeWidth={2} />
            </PanelIcon>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">Need more capacity?</p>
              <p className="mt-0.5 text-sm leading-snug text-gray-600">
                Upgrade your plan to increase limits for menu items, cuisines and more.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onUpgradePlan}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 sm:self-center"
          >
            Upgrade Plan
            <span aria-hidden>↗</span>
          </button>
        </div>
      </div>
    </div>
  );
}
