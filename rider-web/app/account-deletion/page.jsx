'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function AccountDeletionPage() {
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
              Rider Account Deletion
            </h1>
          </div>
          <p className="mb-2 font-semibold text-gray-700">Effective Date: 21-07-2026</p>
          <p className="mb-6 text-gray-600 leading-relaxed">
            This page explains how a Rider/Delivery Partner (&quot;Rider&quot;, &quot;you&quot;) can request
            deletion of their GatiMitra account, what happens to your data, and the conditions that apply.
            It should be read together with our{' '}
            <Link href="/privacy" className="text-orange-600 hover:underline font-medium">Privacy Policy</Link>,{' '}
            <Link href="/terms" className="text-orange-600 hover:underline font-medium">Terms and Conditions</Link>, and{' '}
            <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>.
          </p>

          <div className="mb-8 rounded-lg border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong className="text-gray-800">Important:</strong> For safety, financial-settlement, and
              legal reasons, Riders <b>cannot delete their own account directly from the app</b>. Deletion is
              done by GatiMitra after you raise a request, and only once your wallet balance is <b>not
              negative</b> (i.e. you have no outstanding dues).
            </p>
          </div>

          <ol className="list-decimal pl-6 space-y-6 text-gray-700">
            <li>
              <strong className="block mb-2 text-lg">Why self-deletion is not available</strong>
              <p className="ml-4">
                A Rider account is linked to trips, earnings, payouts, penalties, and wallet transactions. To
                prevent loss of financial records, avoid unsettled dues, and comply with legal and tax
                requirements, account deletion is handled as a <b>reviewed request</b> rather than an instant
                in-app action. This protects both you and GatiMitra and ensures any pending settlement is
                completed correctly.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">How to request account deletion</strong>
              <p className="ml-4 mb-2">
                To request deletion of your account, follow these steps in the GatiMitra Rider App:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1">
                <li>Open the <b>GatiMitra Rider App</b> and sign in.</li>
                <li>Go to <b>Help / Support</b> and select <b>Raise a Ticket</b>.</li>
                <li>Choose the category <b>Account Deletion</b> (or &quot;Delete my account&quot;).</li>
                <li>Confirm your identity and submit the request.</li>
                <li>
                  If you cannot access the app, email us from your registered email at{' '}
                  <a href="mailto:partnerhelp@gatimitra.com" className="text-orange-600 hover:underline font-medium">
                    partnerhelp@gatimitra.com
                  </a>{' '}with your Rider ID and registered phone number.
                </li>
              </ul>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Condition for approval &mdash; wallet must not be negative</strong>
              <p className="ml-4">
                Once you raise a deletion request, our team reviews your account. Your request can be{' '}
                <b>approved only if your wallet balance is not negative</b> &mdash; that is, you have <b>no
                outstanding dues</b> owed to GatiMitra (such as unpaid penalties, negative wallet balance, or
                unreturned equipment charges). If your balance is negative, you will be asked to clear the
                outstanding amount first. A positive wallet balance, if any, will be settled to your registered
                bank account (subject to our{' '}
                <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>
                ) before the account is closed.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">What happens after approval</strong>
              <p className="ml-4 mb-2">
                Once your request is approved and all dues are settled:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1">
                <li>Your account is deactivated and you will no longer be able to log in or take trips.</li>
                <li>Your personal profile data is deleted or anonymised in line with our Privacy Policy.</li>
                <li>
                  Certain records (such as transaction, tax, invoicing, and legal-compliance data) may be
                  retained for the period required by applicable law, in a restricted manner.
                </li>
              </ul>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Processing time</strong>
              <p className="ml-4">
                Deletion requests are usually reviewed and actioned within a reasonable period after all dues
                are cleared, typically within <b>7&ndash;30 days</b>. We may contact you during this period to
                verify your identity or resolve pending settlements. You may withdraw a deletion request before
                it is finalised.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Data we may retain</strong>
              <p className="ml-4">
                Even after your account is deleted, we may retain limited information where required to comply
                with legal obligations, resolve disputes, prevent fraud, or enforce our agreements. Retained
                data is kept securely and used only for these purposes. For details on how your data is handled,
                see our{' '}
                <Link href="/privacy" className="text-orange-600 hover:underline font-medium">Privacy Policy</Link>.
              </p>
            </li>

            <li>
              <strong className="block mb-2 text-lg">Need help?</strong>
              <p className="ml-4">
                For any questions about deleting your account or clearing dues, contact us at{' '}
                <a href="mailto:partnerhelp@gatimitra.com" className="text-orange-600 hover:underline font-medium">
                  partnerhelp@gatimitra.com
                </a>{' '}or raise a ticket in the Rider App.
              </p>
            </li>
          </ol>

          <p className="mt-8 text-gray-600">
            Related:{' '}
            <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>,{' '}
            <Link href="/privacy" className="text-orange-600 hover:underline font-medium">Privacy Policy</Link>, and{' '}
            <Link href="/terms" className="text-orange-600 hover:underline font-medium">Terms and Conditions</Link>.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
