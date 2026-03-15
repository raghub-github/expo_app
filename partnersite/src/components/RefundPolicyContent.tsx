'use client';

import React from 'react';
import {
  FileText,
  Shield,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Mail,
  Clock,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';

export function RefundPolicyContent() {
  const lastUpdated = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  })();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Hero */}
      <div className="text-center mb-10 sm:mb-14">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200 mb-4">
          <FileText size={28} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          GatiMitra Refund Policy
        </h1>
        <p className="text-slate-600 mt-2 text-sm sm:text-base max-w-xl mx-auto">
          Clear guidelines on payments, refunds, and reversals for onboarding fees, subscriptions, and other charges.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Last updated: {lastUpdated}
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4 sm:p-5 mb-8 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-amber-900 text-sm sm:text-base">In short</h2>
          <p className="text-amber-800 text-xs sm:text-sm mt-1 leading-relaxed">
            Payments are <strong>non-refundable</strong> once processed. Refunds or reversals may be considered only for duplicate charges, service failures, or erroneous debits, at GatiMitra&apos;s discretion and after verification.
          </p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/80">
            <Shield className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-bold text-slate-900">General policy</h2>
          </div>
          <div className="p-5 sm:p-6 prose prose-slate prose-sm max-w-none">
            <p className="text-slate-700 leading-relaxed">
              All payments made to GatiMitra—including but not limited to <strong>onboarding fees</strong>, <strong>subscription charges</strong>, <strong>plan upgrades</strong>, and any other one-time or recurring fees—are <strong>non-refundable</strong> once the payment has been successfully processed and reflected in our systems.
            </p>
            <p className="text-slate-700 leading-relaxed mt-4">
              By completing a payment, you acknowledge that you have read and accepted the applicable terms and this refund policy. We recommend reviewing your plan and amount before confirming payment.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/80">
            <RefreshCw className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">When refunds or reversals may be considered</h2>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-slate-700 text-sm leading-relaxed mb-4">
              GatiMitra may, at its sole discretion and subject to verification, consider a refund or reversal only in the following circumstances:
            </p>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">Duplicate payment</h3>
                  <p className="text-slate-600 text-sm mt-0.5">
                    The same payment was charged more than once due to a technical or processing error (e.g. double click, gateway retry). Proof of duplicate debit may be required.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">Service failure</h3>
                  <p className="text-slate-600 text-sm mt-0.5">
                    Payment was taken but the corresponding service (e.g. plan activation, onboarding completion, feature access) was not provided or could not be completed due to a platform or operational failure on GatiMitra&apos;s side.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">Erroneous charge</h3>
                  <p className="text-slate-600 text-sm mt-0.5">
                    The amount debited was incorrect, or the charge was applied in error (wrong plan, wrong store, or similar). Documentation may be required for verification.
                  </p>
                </div>
              </li>
            </ul>
            <p className="text-slate-600 text-sm mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
              Approval of any refund or reversal is not guaranteed. Each request is evaluated on a case-by-case basis. Reversals may be credited to your wallet or refunded to the original payment method, depending on the situation and our policy at the time.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/80">
            <XCircle className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-bold text-slate-900">What we do not refund</h2>
          </div>
          <div className="p-5 sm:p-6">
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-slate-400 mt-1">•</span>
                Change of mind or no longer needing the service after payment.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400 mt-1">•</span>
                Partial use of subscription or onboarding (e.g. used for some time then cancelled).
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400 mt-1">•</span>
                Disputes related to commission, fees, or payouts that are in line with your agreed terms.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400 mt-1">•</span>
                Payments made from an incorrect account or by mistake without a qualifying reason above.
              </li>
            </ul>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/80">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900">Processing time</h2>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-slate-700 text-sm leading-relaxed">
              If your refund or reversal is approved, we will process it within <strong>5–10 business days</strong>. The time taken for the amount to reflect in your bank account or wallet may vary depending on your bank or payment provider. We are not responsible for delays caused by third-party payment processors or banks.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/80">
            <Mail className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-bold text-slate-900">How to request a refund</h2>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-slate-700 text-sm leading-relaxed mb-4">
              To request a refund or reversal, contact our support team with the following information:
            </p>
            <ul className="space-y-1.5 text-sm text-slate-700 mb-4 list-disc list-inside">
              <li>Your <strong>merchant ID</strong> or registered email / phone</li>
              <li><strong>Transaction details</strong> (date, amount, payment reference or order ID if any)</li>
              <li>Clear <strong>reason</strong> for the request (e.g. duplicate charge, service not received)</li>
              <li>Any <strong>screenshots or proof</strong> (e.g. bank statement showing duplicate debit)</li>
            </ul>
            <p className="text-slate-700 text-sm leading-relaxed mb-3">
              Email us at:
            </p>
            <a
              href="mailto:support@gatimitra.com"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors shadow-sm"
            >
              <Mail size={18} />
              support@gatimitra.com
            </a>
            <p className="text-slate-500 text-xs mt-4">
              We aim to respond to refund requests within 2–3 business days. Approval and processing time may vary based on the nature of the request and verification required.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/80 p-5 sm:p-6 flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-slate-900">Questions?</h2>
            <p className="text-slate-600 text-sm mt-1">
              For any questions about payments, subscriptions, or this refund policy, reach out to <a href="mailto:support@gatimitra.com" className="text-orange-600 hover:underline font-medium">support@gatimitra.com</a>. Our team is here to help.
            </p>
          </div>
        </section>
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-slate-500 mt-10 pb-8">
        This policy forms part of your agreement with GatiMitra. We may update it from time to time; the latest version will be available on this page.
      </p>
    </div>
  );
}
