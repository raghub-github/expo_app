'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function RefundPolicyPage() {
  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navbar />
      </div>
      <div className="min-h-screen w-full bg-gray-50 pt-24 pb-12 px-4">
        <div className="max-w-7xl mx-auto p-6 md:p-8 bg-white rounded-lg shadow-lg">
          <div className="flex items-center mb-8 gap-6">
            <img src="/onlylogo.png" alt="GatiMitra Logo" className="h-20 w-auto" />
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800">
              Rider Refund Policy
            </h1>
          </div>
          <p className="mb-2 font-semibold text-gray-700">Effective Date: 21-07-2026</p>
          <p className="mb-6 text-gray-600 leading-relaxed">
            This Refund Policy (&quot;Policy&quot;) explains how refunds are handled for the various payments a
            Rider/Delivery Partner (&quot;Rider&quot;, &quot;you&quot;) makes to GatiMitra On-Demand Services Pvt.
            Ltd. (&quot;GatiMitra&quot;, &quot;we&quot;, &quot;us&quot;) through the GatiMitra Rider Application or
            during onboarding. Please read it together with our{' '}
            <Link href="/terms" className="text-orange-600 hover:underline font-medium">
              Terms and Conditions
            </Link>
            . By making any payment to GatiMitra, you agree to the terms set out below.
          </p>

          <div className="mb-8 rounded-lg border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong className="text-gray-800">In short:</strong> Onboarding fees are refundable if you are
              genuinely unable to onboard. Subscription/membership fees are non-refundable once activated.
              Penalties are refunded when the fault is not yours &mdash; and even where a fault exists, we are
              still open to reviewing and discussing your case fairly.
            </p>
          </div>

          <ol className="list-decimal pl-6 space-y-6 text-gray-700">
            <li>
              <strong className="block mb-2 text-lg">Types of payments covered</strong>
              <p className="ml-4 mb-3">
                As a Rider you may be asked to pay one or more of the following. Each has its own refund
                treatment, described in the sections that follow:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1">
                <li><b>Onboarding fee</b> &mdash; a one-time fee toward verification, activation, and onboarding.</li>
                <li><b>Subscription / membership fee</b> &mdash; a recurring or period-based fee to access the platform.</li>
                <li><b>Penalties / fines</b> &mdash; charges levied for cancellations, no-shows, policy breaches, or customer complaints.</li>
                <li><b>Security deposit</b> (where applicable) &mdash; a refundable deposit against equipment or dues.</li>
                <li><b>Wallet recharges / top-ups</b> &mdash; amounts you add to your in-app wallet.</li>
                <li><b>Kit / equipment charges</b> &mdash; charges for delivery bags, jackets, or other gear.</li>
              </ul>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Onboarding fees &mdash; refundable if you cannot onboard</strong>
              <p className="ml-4 mb-2">
                Your onboarding fee is <b>refundable</b> if you are ultimately <b>unable to onboard</b> onto the
                platform. This includes situations such as:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1 mb-2">
                <li>GatiMitra is unable to activate you in your area (for example, no serviceable zone or no rider slots).</li>
                <li>Your application is rejected by GatiMitra after the fee was collected, for reasons not involving fraud or misrepresentation by you.</li>
                <li>A technical or verification failure on our side prevents your account from going live.</li>
                <li>You withdraw your application before onboarding is completed and before your account is activated.</li>
              </ul>
              <p className="ml-4">
                The onboarding fee is <b>not refundable</b> where you have successfully onboarded and become
                eligible to take trips, or where onboarding could not be completed because of your own
                actions &mdash; for example, submitting forged or invalid documents, failing background or
                eligibility checks due to misrepresentation, or repeatedly failing to complete required steps
                despite reasonable opportunity.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Subscription / membership fees &mdash; non-refundable</strong>
              <p className="ml-4 mb-2">
                Subscription or membership fees give you access to the platform for a defined period. Once a
                subscription is <b>activated</b>, the fee is <b>non-refundable</b>, in full or in part, including
                where:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1 mb-2">
                <li>You choose to stop using the platform before the subscription period ends.</li>
                <li>You are inactive, take no trips, or take fewer trips than expected during the period.</li>
                <li>Your account is suspended or terminated because of a policy breach on your part.</li>
              </ul>
              <p className="ml-4">
                No pro-rata or partial refund is provided for unused days of an activated subscription. If a
                subscription was charged in error (for example, a duplicate charge or a billing failure on our
                side), that erroneous charge will be refunded on verification.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Penalties &mdash; refundable when the fault is not yours</strong>
              <p className="ml-4 mb-2">
                Penalties are charges applied for events such as order cancellations, no-shows, late or failed
                deliveries, or customer complaints. Our approach to penalty refunds is designed to be fair:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1 mb-2">
                <li>
                  <b>No fault on your part &mdash; refundable.</b> If a penalty was charged for something that
                  was not your fault (for example, an app or GPS error, a merchant delay, an incorrect customer
                  address, unsafe conditions, or a wrongly registered complaint), the penalty will be reversed
                  once verified.
                </li>
                <li>
                  <b>Fault on your part &mdash; open to discussion.</b> Even where a penalty was validly applied
                  for a genuine fault, we are still willing to <b>review and discuss</b> your case. Depending on
                  the circumstances, your history, and the severity, we may waive, reduce, or uphold the penalty
                  at our reasonable discretion.
                </li>
              </ul>
              <p className="ml-4">
                To contest a penalty, raise a ticket through the Rider App with the order/reference details and
                any supporting evidence (screenshots, photos, notes). We aim to review penalty disputes promptly.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Security deposits &mdash; refundable after dues clearance</strong>
              <p className="ml-4">
                Where a refundable security deposit was collected, it is returned to you when you leave the
                platform or return the associated equipment, <b>after</b> deduction of any outstanding dues,
                damages, or pending penalties, and provided your wallet balance is not negative. Deposits are
                processed once your account is fully settled and offboarded.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Wallet balances &mdash; returned if positive</strong>
              <p className="ml-4">
                Any positive balance in your in-app wallet can be refunded to your registered bank account when
                you offboard, after settlement of all dues, penalties, and adjustments. Refunds cannot be
                processed while your wallet balance is <b>negative</b> &mdash; the outstanding amount must be
                cleared first. Wallet top-ups already consumed toward platform charges are not refundable.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Kit / equipment charges</strong>
              <p className="ml-4">
                Charges for delivery bags, jackets, or other equipment are generally non-refundable once the
                item has been issued to you and used. Unused equipment returned in good condition within a
                reasonable time may be eligible for a refund or exchange at our discretion. Faulty or damaged
                equipment received from us will be replaced free of charge.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">How to request a refund</strong>
              <p className="ml-4 mb-2">
                All refund requests must be raised through the GatiMitra Rider App:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1">
                <li>Open the Rider App and go to <b>Help / Support</b> and <b>Raise a Ticket</b>.</li>
                <li>Select the relevant category (onboarding fee, penalty, wallet, etc.).</li>
                <li>Describe your request and attach supporting evidence where available.</li>
                <li>You may also email us at{' '}
                  <a href="mailto:partnerhelp@gatimitra.com" className="text-orange-600 hover:underline font-medium">
                    partnerhelp@gatimitra.com
                  </a>{' '}with your Rider ID and details.
                </li>
              </ul>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Refund method, timelines &amp; deductions</strong>
              <p className="ml-4">
                Approved refunds are made to the original payment method or your registered bank account.
                After approval, refunds are typically processed within <b>5&ndash;7 business days</b>, though the
                time for the amount to reflect depends on your bank or payment provider. We may deduct
                applicable payment-gateway charges, taxes, or outstanding dues from the refund amount. GatiMitra
                is not responsible for delays caused by banks or third-party payment providers.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Fraud, misuse &amp; discretion</strong>
              <p className="ml-4">
                Refunds may be declined where we reasonably suspect fraud, abuse of this Policy, or
                misrepresentation. Nothing in this Policy limits any right you may have under applicable law.
                Where this Policy gives GatiMitra discretion, that discretion will be exercised reasonably and
                in good faith.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Changes to this Policy</strong>
              <p className="ml-4">
                We may update this Refund Policy from time to time. The &quot;Effective Date&quot; above reflects
                the latest version. Material changes will be notified through the Rider App or by email.
                Continued use of the platform after changes means you accept the updated Policy.
              </p>
            </li>
          </ol>

          <p className="mt-8 text-gray-600">
            Related:{' '}
            <Link href="/terms" className="text-orange-600 hover:underline font-medium">Terms and Conditions</Link>,{' '}
            <Link href="/privacy" className="text-orange-600 hover:underline font-medium">Privacy Policy</Link>, and{' '}
            <Link href="/account-deletion" className="text-orange-600 hover:underline font-medium">Account Deletion</Link>.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
