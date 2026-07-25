'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function PrivacyPage() {
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
              Privacy Policy
            </h1>
          </div>
          <p className="mb-2 font-semibold text-gray-700">Effective Date: 21-07-2026</p>
          <p className="mb-6 text-gray-600 leading-relaxed">
            GatiMitra On-Demand Services Pvt. Ltd. (&quot;GatiMitra&quot;, &quot;we&quot;, &quot;us&quot;) is
            committed to protecting your privacy. This policy describes how we collect, use, store, share, and
            protect your information when you use our website, our Rider Application, and related services. It
            applies to Riders/Delivery Partners and visitors to our website. Please read it together with our{' '}
            <Link href="/terms" className="text-orange-600 hover:underline font-medium">Terms and Conditions</Link>.
          </p>

          <ol className="list-decimal pl-6 space-y-6 text-gray-700">
            <li>
              <strong className="block mb-2 text-lg">Information we collect</strong>
              <p className="ml-4 mb-2">
                Depending on how you interact with us, we may collect:
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-1">
                <li><b>Identity &amp; contact data:</b> name, photograph, date of birth, email, phone number, and address.</li>
                <li><b>Onboarding &amp; KYC data:</b> driving license, vehicle registration, insurance, PAN/Aadhaar or other government IDs, and background-verification results, as permitted by law.</li>
                <li><b>Banking &amp; payment data:</b> bank account or UPI details for payouts, and records of charges, penalties, and wallet transactions.</li>
                <li><b>Location data:</b> precise and background location while you are on Active Duty, to assign trips, enable navigation, and ensure safety.</li>
                <li><b>Photos, documents &amp; media:</b> images and files you capture with the camera or upload from your device (KYC and vehicle documents, profile photo, proof of pickup/delivery, and support attachments).</li>
                <li><b>Device &amp; usage data:</b> device identifiers, IP address, app version, log data, and pages/features used.</li>
                <li><b>Communications:</b> support tickets, call/chat records, and feedback.</li>
              </ul>
            </li>
            <li>
              <strong className="block mb-2 text-lg">How we use your information</strong>
              <p className="ml-4">
                We use your information to onboard and verify you; assign and facilitate Service Requests;
                calculate and process earnings, payouts, charges, and penalties; provide navigation and safety
                features; communicate updates, offers, and support; detect and prevent fraud and misuse; improve
                our services and conduct analytics; and comply with legal, tax, and regulatory obligations.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Legal basis for processing</strong>
              <p className="ml-4">
                We process your data on the basis of your consent, the performance of our agreement with you, our
                legitimate interests in operating and securing the Platform, and compliance with legal
                obligations. Where we rely on consent (for example, for certain marketing), you may withdraw it at
                any time.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Location data</strong>
              <p className="ml-4">
                To operate the Platform, our Rider App may collect location data in the foreground and background
                while you are on Active Duty, even when the app is not open, so we can match you to nearby Service
                Requests, provide navigation, and support safety. You can control location permissions through
                your device settings; disabling location will limit your ability to receive and complete trips.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">App permissions we request</strong>
              <p className="ml-4 mb-2">
                The GatiMitra Rider App requests the device permissions below. Each is used only for the purpose
                stated, and we ask for a permission only when the related feature needs it. You can grant or
                revoke any of these from your device settings — declining some will limit the related feature.
              </p>
              <ul className="ml-4 list-disc pl-5 space-y-2">
                <li>
                  <b>Location — precise &amp; background:</b> to share your live location while you are on Active
                  Duty and to run a foreground location service, so we can assign nearby trips, provide
                  navigation, show your location to the customer during a delivery, and support safety. Precise
                  and background location may be collected even when the app is minimised or the screen is off,
                  but <b>only while you are on duty or on an active trip</b> — never otherwise.
                </li>
                <li>
                  <b>Camera:</b> to let you capture images in-app — for example KYC/onboarding documents, your
                  profile photo, and proof-of-pickup or proof-of-delivery photos.
                </li>
                <li>
                  <b>Photos, media &amp; files (storage):</b> to let you select and upload existing documents or
                  images from your device (KYC documents, vehicle papers, delivery proof, support attachments).
                </li>
                <li>
                  <b>Notifications:</b> to alert you about new order/trip requests, order and payout updates,
                  penalties, and important account or safety messages.
                </li>
                <li>
                  <b>Display over other apps (draw over other apps):</b> to show incoming order/trip alerts as a
                  pop-up on top of other screens, so you don&apos;t miss a request while using another app.
                </li>
                <li>
                  <b>Ignore battery optimisation:</b> to ask your device to exempt the Rider App from aggressive
                  battery/doze restrictions, so location updates and order notifications keep working reliably
                  while you are on duty. This is optional and can be turned off in device settings.
                </li>
                <li>
                  <b>Foreground service:</b> to keep the location and order-listening service running with a
                  persistent notification while you are on duty, as required for reliable background operation.
                </li>
              </ul>
              <p className="ml-4 mt-2">
                You can revoke any permission at any time from your device&apos;s app settings. Revoking a
                permission does not delete data already collected — see &quot;Data retention&quot; below and our{' '}
                <Link href="/account-deletion" className="text-orange-600 hover:underline font-medium">Account Deletion</Link>{' '}
                process.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Sharing of information</strong>
              <p className="ml-4">
                We may share information with customers and merchants to the extent needed to complete a Service
                (for example, your name, photo, vehicle, and live location); with payment processors, banks, and
                verification agencies; with service providers who support our operations; and with authorities or
                third parties where required by law or to protect rights and safety. We do not sell your personal
                data.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Data retention</strong>
              <p className="ml-4">
                We retain your information for as long as your account is active and thereafter for the period
                required to meet legal, tax, accounting, dispute-resolution, and fraud-prevention needs. When data
                is no longer required, we delete or anonymise it. See our{' '}
                <Link href="/account-deletion" className="text-orange-600 hover:underline font-medium">Account Deletion</Link>{' '}
                process for how deletion requests are handled.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Data security</strong>
              <p className="ml-4">
                We use industry-standard measures to protect your data, including encryption and secure storage.
                No method of transmission over the internet is 100% secure; we encourage you to use strong
                passwords and keep your account details confidential.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Your rights</strong>
              <p className="ml-4">
                Depending on applicable law, you may have the right to access, correct, delete, or port your data,
                and to withdraw consent or object to certain processing. To exercise these rights, or to request
                account deletion, raise a ticket in the Rider App or contact us at{' '}
                <a href="mailto:partnerhelp@gatimitra.com" className="text-orange-600 hover:underline font-medium">
                  partnerhelp@gatimitra.com
                </a>
                . You may also manage cookie preferences as described in our{' '}
                <Link href="/cookies" className="text-orange-600 hover:underline font-medium">Cookie Policy</Link>.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Children</strong>
              <p className="ml-4">
                Our services are intended for individuals aged 18 and above. We do not knowingly collect personal
                data from minors. If you believe a minor has provided us data, please contact us so we can remove it.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Grievance Officer</strong>
              <p className="ml-4">
                For privacy-related concerns or grievances, you may contact our Grievance Officer at{' '}
                <a href="mailto:partnerhelp@gatimitra.com" className="text-orange-600 hover:underline font-medium">
                  partnerhelp@gatimitra.com
                </a>
                . We will acknowledge and address grievances within the timelines prescribed under applicable law.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Updates</strong>
              <p className="ml-4">
                We may update this Privacy Policy from time to time. The &quot;Effective Date&quot; at the top will
                reflect the latest version. We will notify you of material changes via email, the Rider App, or a
                notice on our services. Continued use after changes means you accept the updated policy.
              </p>
            </li>
          </ol>

          <p className="mt-8 text-gray-600">
            Related:{' '}
            <Link href="/terms" className="text-orange-600 hover:underline font-medium">Terms and Conditions</Link>,{' '}
            <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>,{' '}
            <Link href="/account-deletion" className="text-orange-600 hover:underline font-medium">Account Deletion</Link>, and{' '}
            <Link href="/cookies" className="text-orange-600 hover:underline font-medium">Cookie Policy</Link>.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
