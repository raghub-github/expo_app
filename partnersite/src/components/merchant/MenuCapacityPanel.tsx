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
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <PanelIcon className={iconClassName}>{icon}</PanelIcon>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold leading-snug text-gray-900">{title}</p>
              <span
                className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold sm:px-3 sm:text-sm ${countClassName}`}
              >
                {countLabel}
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug text-gray-500">{description}</p>
          </div>
        </div>
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
      ) : limitReached && limitMessage ? (
        <div className="mt-auto px-5 pb-5">
          <p className="flex items-center gap-1 text-xs font-medium text-red-600">
            <Lock size={12} aria-hidden />
            {limitMessage}
          </p>
        </div>
      ) : (
        <div className="pb-5" aria-hidden />
      )}
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

  const canShowImpactDetails =
    planUsage != null ||
    (maxMenuItems != null && maxMenuItems > 0 && currentMenuItemsCount >= maxMenuItems);

  const showBanner =
    menuLimitReached || effectiveLocked > 0 || (planUsageLoading && !canShowImpactDetails);

  if (!showBanner) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5">
      <div className="flex items-start gap-3">
        <PanelIcon className="bg-amber-100 text-amber-700">
          <AlertTriangle size={20} strokeWidth={2} />
        </PanelIcon>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">What happens on your store</p>
          {planUsageLoading && !canShowImpactDetails ? (
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

  const menuCountLabel = `${currentMenuItemsCount} / ${maxMenuItems ?? '∞'}`;

  return (
    <div className="rounded-xl bg-[#F9FAFB] p-5 sm:p-6">
      <div className="mb-5 flex min-w-0 items-start gap-4 sm:mb-6">
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

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Lightbulb size={16} strokeWidth={2} />
            </div>
            <p className="min-w-0 truncate text-sm text-gray-700">
              <span className="font-semibold text-gray-900">Need more capacity?</span>
              <span className="hidden text-gray-600 sm:inline"> — Upgrade your plan to increase limits for menu items, cuisines and more.</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onUpgradePlan}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 sm:text-sm sm:px-3.5 sm:py-2"
          >
            Upgrade Plan
            <span aria-hidden>↗</span>
          </button>
        </div>

        <StoreImpactBanner
          planUsage={planUsage}
          maxMenuItems={maxMenuItems}
          currentMenuItemsCount={currentMenuItemsCount}
          menuLimitReached={menuLimitReached}
          planUsageLoading={planUsageLoading}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

        <CapacityCard
          icon={<ImageIcon size={20} strokeWidth={2} />}
          iconClassName="bg-orange-50 text-orange-600"
          title="Image Uploads"
          description="Upload images for your menu items."
          countLabel={imageUploadAllowed ? '✓ Enabled' : 'Locked'}
          countClassName={
            imageUploadAllowed
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-gray-100 text-gray-600'
          }
          progressPercent={null}
          progressClassName=""
          limitReached={!imageUploadAllowed}
          limitMessage={
            imageUploadAllowed ? undefined : 'Upgrade plan to enable image uploads.'
          }
        />
        </div>
      </div>
    </div>
  );
}
