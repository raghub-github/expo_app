'use client';

import type { ReactNode } from 'react';
import { Briefcase, Clock, Printer, Save, Timer, Zap } from 'lucide-react';

export type StoreOperationsPanelProps = {
  autoAcceptOrders: boolean;
  onAutoAcceptOrdersChange: (value: boolean) => void;
  avgPreparationTimeMinutes: number;
  onAvgPreparationTimeMinutesChange: (value: number) => void;
  preparationBufferMinutes: number;
  onPreparationBufferMinutesChange: (value: number) => void;
  manualActivationLock: boolean;
  onManualActivationLockChange: (value: boolean) => void;
  thermalPrinterWidthMm: 58 | 80;
  onThermalPrinterWidthMmChange: (value: 58 | 80) => void;
  licenseBlockedForOps: boolean;
  isSaving: boolean;
  onSave: () => void;
};

const PREP_MIN = 5;
const PREP_MAX = 180;
const BUFFER_MAX = 120;

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex shrink-0 items-center ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
    </label>
  );
}

function SettingIcon({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${className}`}
    >
      {children}
    </div>
  );
}

function MinutesStepper({
  value,
  onChange,
  min,
  max,
  ariaLabelDecrease,
  ariaLabelIncrease,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  ariaLabelDecrease: string;
  ariaLabelIncrease: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-lg font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={ariaLabelDecrease}
      >
        −
      </button>
      <div className="flex min-w-[72px] flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-1.5">
        <span className="text-2xl font-bold leading-none text-gray-900">{value}</span>
        <span className="mt-0.5 text-xs text-gray-500">minutes</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-lg font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={ariaLabelIncrease}
      >
        +
      </button>
    </div>
  );
}

function NumericSettingCard({
  icon,
  iconClassName,
  title,
  description,
  footer,
  value,
  onChange,
  min,
  max,
  decreaseLabel,
  increaseLabel,
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  description: string;
  footer?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <SettingIcon className={iconClassName}>{icon}</SettingIcon>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{title}</p>
            <p className="mt-0.5 text-sm leading-snug text-gray-500">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center sm:items-end">
          <MinutesStepper
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            ariaLabelDecrease={decreaseLabel}
            ariaLabelIncrease={increaseLabel}
          />
          {footer ? (
            <p className="mt-2 text-center text-xs text-gray-500 sm:text-right">{footer}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function StoreOperationsPanel({
  autoAcceptOrders,
  onAutoAcceptOrdersChange,
  avgPreparationTimeMinutes,
  onAvgPreparationTimeMinutesChange,
  preparationBufferMinutes,
  onPreparationBufferMinutesChange,
  manualActivationLock,
  onManualActivationLockChange,
  thermalPrinterWidthMm,
  onThermalPrinterWidthMmChange,
  licenseBlockedForOps,
  isSaving,
  onSave,
}: StoreOperationsPanelProps) {
  const totalPrepOnAccept = avgPreparationTimeMinutes + preparationBufferMinutes;

  return (
    <div className="rounded-xl bg-[#F9FAFB] p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900 sm:text-xl">Store Operations</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500">
            Control how your store handles incoming orders and manages operations when
            you&apos;re offline.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={16} strokeWidth={2.25} />
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <SettingIcon className="bg-emerald-50 text-emerald-700">
              <Briefcase size={20} strokeWidth={2} />
            </SettingIcon>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">Auto Accept Orders</p>
              <p className="mt-0.5 text-sm leading-snug text-gray-500">
                Incoming orders are automatically accepted on behalf of your store—so you never miss a
                customer, even when you&apos;re away.
              </p>
            </div>
          </div>
          <Toggle checked={autoAcceptOrders} onChange={onAutoAcceptOrdersChange} />
        </div>

        <NumericSettingCard
          icon={<Timer size={20} strokeWidth={2} />}
          iconClassName="bg-sky-50 text-sky-700"
          title="Default Preparation Time"
          description="Your store's default kitchen prep time for new orders."
          value={avgPreparationTimeMinutes}
          onChange={onAvgPreparationTimeMinutesChange}
          min={PREP_MIN}
          max={PREP_MAX}
          decreaseLabel="Decrease default preparation time"
          increaseLabel="Increase default preparation time"
          footer="Used when you accept orders and shown to customers as your default prep time."
        />

        <NumericSettingCard
          icon={<Clock size={20} strokeWidth={2} />}
          iconClassName="bg-violet-50 text-violet-700"
          title="Preparation Buffer"
          description="Extra time added to the default preparation time for every accepted order."
          value={preparationBufferMinutes}
          onChange={onPreparationBufferMinutesChange}
          min={0}
          max={BUFFER_MAX}
          decreaseLabel="Decrease preparation buffer"
          increaseLabel="Increase preparation buffer"
          footer={`Applies to manual and auto accepted orders. Total on accept: ${totalPrepOnAccept} min.`}
        />

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <SettingIcon className="bg-amber-50 text-amber-600">
              <Zap size={20} strokeWidth={2} />
            </SettingIcon>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">Manual Activation Lock</p>
              <p className="mt-0.5 text-sm leading-snug text-gray-500">
                {licenseBlockedForOps
                  ? 'Cannot change while store is closed due to expired licence.'
                  : "When enabled, your store won't open automatically at scheduled outlet times—you'll need to turn it on manually."}
              </p>
            </div>
          </div>
          <Toggle
            checked={manualActivationLock}
            onChange={onManualActivationLockChange}
            disabled={licenseBlockedForOps}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FF]">
              <Printer className="h-5 w-5 text-[#4F46E5]" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Thermal printer width</p>
              <p className="mt-0.5 text-sm leading-snug text-gray-500">
                Kitchen order tickets (KOT) adapt to your receipt printer. 80mm is the default for most thermal printers.
              </p>
              <fieldset className="mt-3 flex flex-wrap gap-4" disabled={licenseBlockedForOps}>
                <legend className="sr-only">Thermal printer width</legend>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="thermal-printer-width"
                    className="h-4 w-4 border-gray-300 text-[#4F46E5] focus:ring-[#4F46E5]"
                    checked={thermalPrinterWidthMm === 58}
                    onChange={() => onThermalPrinterWidthMmChange(58)}
                  />
                  58mm
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="thermal-printer-width"
                    className="h-4 w-4 border-gray-300 text-[#4F46E5] focus:ring-[#4F46E5]"
                    checked={thermalPrinterWidthMm === 80}
                    onChange={() => onThermalPrinterWidthMmChange(80)}
                  />
                  80mm (default)
                </label>
              </fieldset>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
