'use client';

import React from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type TermsProps = {
  /** Reserved for embedding an acceptance UI; the public page renders read-only. */
  showAcceptance?: boolean;
};

const Terms: React.FC<TermsProps> = () => (
  <>
    <div className="fixed top-0 left-0 right-0 z-50">
      <Navbar />
    </div>
    <div className="min-h-screen w-full bg-gray-50 pt-24 pb-12 px-4">
      <div className="max-w-7xl mx-auto p-6 md:p-8 bg-white rounded-lg shadow-lg">
        <div className="flex items-center mb-8 gap-6">
          <img src="/onlylogo.png" alt="GatiMitra Logo" className="h-20 w-auto" />
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800">
            GatiMitra Rider / Delivery Partner Terms and Conditions
          </h1>
        </div>
        <p className="mb-2 font-semibold text-gray-700">Effective Date: 21-07-2026</p>
        <p className="mb-6 text-gray-600 leading-relaxed">
          This Rider/Delivery Partner Agreement &amp; Terms and Conditions (&quot;Agreement&quot;) is entered
          into between GatiMitra On-Demand Services Pvt. Ltd. (&quot;GatiMitra&quot;, &quot;we&quot;, &quot;us&quot;,
          or the &quot;Platform&quot;) and you, the Rider/Delivery Partner (&quot;Rider&quot;, &quot;you&quot;). By
          accessing, registering on, or using the GatiMitra Platform and Rider Application, you confirm that you
          have read, understood, and agree to be bound by this Agreement, along with our{" "}
          <Link href="/privacy" className="text-orange-600 hover:underline font-medium">Privacy Policy</Link>,{" "}
          <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>, and{" "}
          <Link href="/account-deletion" className="text-orange-600 hover:underline font-medium">Account Deletion</Link>{" "}
          process, each of which is incorporated by reference. If you do not agree, do not use the Platform.
        </p>

        <div className="mb-8 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            <strong className="text-gray-800">Please note:</strong> You engage with GatiMitra as an independent
            contractor, not an employee. You are responsible for your own vehicle, taxes, and statutory
            compliance. Certain charges (such as onboarding and subscription fees) may apply and are governed by
            our{" "}
            <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>.
          </p>
        </div>

        <ol className="list-decimal pl-6 space-y-6">
          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Definitions</strong>
            <div className="ml-4 space-y-1">
              <p><b>Active Duty:</b> The period when you are available to accept and perform Service Requests via the GatiMitra Rider App.</p>
              <p><b>Earnings:</b> Total compensation for completed Services, including Service Fees and Incentives.</p>
              <p><b>Service Request:</b> A customer&apos;s request for delivery or transport services through the Platform.</p>
              <p><b>Wallet:</b> Your in-app account that records charges, penalties, top-ups, and adjustments payable to or by you.</p>
            </div>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Eligibility &amp; Onboarding</strong>
            <p className="ml-4">
              You must be at least 18 years old and legally competent. You are required to possess and maintain
              at your own expense: a valid driving license, vehicle registration, third-party liability insurance,
              and any other legally required permits. GatiMitra reserves the right to approve or reject your
              application at its sole discretion. You must provide true, complete, and current information during
              onboarding; providing false or forged documents is grounds for immediate rejection or termination.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Background Verification &amp; Consent</strong>
            <p className="ml-4">
              You consent to GatiMitra (directly or through authorised third-party agencies) verifying your
              identity, documents, address, driving license, and criminal-record/background checks as permitted
              by law, both at onboarding and periodically thereafter. Continued access to the Platform is
              conditional on your successfully clearing these checks. You agree to promptly update GatiMitra of
              any change to your documents, license status, or legal eligibility to provide Services.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Independent Contractor Relationship</strong>
            <p className="ml-4">
              You are an independent contractor. No employment, agency, or partnership relationship is created
              between you and GatiMitra. You have complete control over your work schedule and may work with
              other platforms. You are solely responsible for your own taxes and statutory compliances.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Scope of Services</strong>
            <p className="ml-4">
              You may provide one or more of the following services via the Platform: Food Delivery, Passenger
              Ride Services, or Parcel Delivery. GatiMitra does not guarantee any minimum number of Service
              Requests, earnings, or continuous availability of the Platform.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Charges Payable by You</strong>
            <p className="ml-4">
              You may be required to pay certain charges to use the Platform, which may include a one-time{" "}
              <b>onboarding fee</b>, a periodic <b>subscription/membership fee</b>, a refundable{" "}
              <b>security deposit</b>, and charges for any <b>kit or equipment</b> issued to you. The applicable
              amounts are shown to you before payment and may be revised with notice. The refundability of each
              charge is governed by our{" "}
              <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>{" "}
              &mdash; in summary, onboarding fees are refundable if you are unable to onboard, while activated
              subscription fees are non-refundable.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Your Responsibilities</strong>
            <p className="ml-4">
              You agree to perform Services professionally, courteously, and safely. You must comply with all
              traffic laws, maintain your vehicle at your own cost, and use any provided GatiMitra equipment
              responsibly. You must personally perform the Services and not subcontract your obligations. You are
              responsible for the safe handling of orders, food, and any customer property in your custody.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Platform Responsibilities</strong>
            <p className="ml-4">
              GatiMitra will provide access to the Rider Application to connect you with customers and merchants,
              offer a transparent system to view your earnings and performance, and provide basic app-related support.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Relationship with Customers &amp; Merchants</strong>
            <p className="ml-4">
              GatiMitra acts as a technology platform connecting you with customers and merchants. You are
              responsible for your direct interactions with them and must conduct yourself respectfully and
              lawfully. You must not solicit customers or merchants for services outside the Platform, collect
              payments other than as permitted, or share your personal contact details for off-platform dealings.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Earnings &amp; Payouts</strong>
            <p className="ml-4">
              Your Earnings for each completed Service consist of a Service Fee, calculated based on a methodology
              (e.g., base fare, distance, time) displayed in the app, which GatiMitra may change with notice.
              GatiMitra may offer discretionary Incentives, terms for which will be communicated separately.
              Earnings, net of any permissible deductions, will be settled to your registered bank account as per
              the disclosed payout cycle (e.g., weekly).
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Penalties &amp; Deductions</strong>
            <p className="ml-4">
              GatiMitra may levy penalties or deductions for events such as order cancellations, no-shows, late or
              failed deliveries, damage to orders, or verified customer complaints. Penalties are debited from your
              Wallet or adjusted against your Earnings. If a penalty was charged through no fault of yours, it will
              be reversed on verification; even where a fault exists, you may raise the matter and we will fairly
              review and discuss it. Penalty disputes and their refund treatment are governed by our{" "}
              <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Taxes &amp; Compliance</strong>
            <p className="ml-4">
              You are solely responsible for all taxes arising from your earnings. GatiMitra may deduct TDS or
              other statutory amounts if mandated by law. You must comply with all applicable laws, including
              the Motor Vehicles Act, 1988.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Cash Handling (if applicable)</strong>
            <p className="ml-4">
              For Cash on Delivery (COD) orders, you must collect the exact cash amount from the customer and
              deposit it via GatiMitra&apos;s prescribed mechanism within the stipulated time. You are liable for any
              loss or shortage until successful deposit.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Incentives &amp; Promotions</strong>
            <p className="ml-4">
              Incentives or promotional schemes are offered at GatiMitra&apos;s sole discretion and may be modified,
              cancelled, or withdrawn at any time without prior notice.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Service Quality &amp; Ratings</strong>
            <p className="ml-4">
              Customers may rate their experience. Consistent low ratings or negative feedback may impact your
              access to features or incentives and could lead to remedial training or suspension.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Vehicle &amp; Equipment</strong>
            <p className="ml-4">
              Your vehicle is owned, controlled, and maintained solely by you at your expense. GatiMitra is not
              responsible for any breakdown, accident, or violation related to your vehicle.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Prohibited Conduct</strong>
            <p className="ml-4">
              You shall not engage in fraud, manipulate the Platform, consume intoxicants while on duty, harass
              or discriminate against anyone, tamper with orders, or misuse GatiMitra&apos;s intellectual property.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Confidentiality &amp; Non-Solicitation</strong>
            <p className="ml-4">
              You may receive confidential information (such as customer details, addresses, pricing, and business
              data) while providing Services. You must keep this information confidential, use it only to perform
              Services, and not disclose or exploit it for any other purpose. You must not use GatiMitra&apos;s
              customer or merchant relationships to divert business away from the Platform.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Suspension &amp; Termination</strong>
            <p className="ml-4">
              GatiMitra may suspend your access immediately for suspected fraud, safety violations, serious
              complaints, or breach of this Agreement. GatiMitra may terminate this Agreement for cause. You may
              terminate at any time with written notice. Upon termination, all legitimate outstanding earnings
              will be paid in the next payout cycle, subject to withholdings for any liabilities. Account deletion
              is handled per our{" "}
              <Link href="/account-deletion" className="text-orange-600 hover:underline font-medium">Account Deletion</Link>{" "}
              process and requires your Wallet balance to be non-negative.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Limitation of Liability</strong>
            <p className="ml-4">
              To the maximum extent permitted by law, GatiMitra shall not be liable for any indirect, incidental,
              or consequential damages. Its aggregate liability to you for any claim is limited to the Service
              Fee earned for the specific Service Request in question.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Your Indemnity</strong>
            <p className="ml-4">
              You agree to indemnify and hold harmless GatiMitra from any claims, losses, or expenses arising
              from your breach of this Agreement, your misconduct, any accident or damage caused by you or your
              vehicle, or your violation of any law.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Intellectual Property</strong>
            <p className="ml-4">
              All intellectual property rights in the GatiMitra Platform are owned by GatiMitra. You are granted
              a limited, revocable license to use the Rider App and branding materials strictly for providing
              Services under this Agreement.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Data &amp; Privacy</strong>
            <p className="ml-4">
              GatiMitra&apos;s handling of your personal data is governed by its{" "}
              <Link href="/privacy" className="text-orange-600 hover:underline font-medium">Privacy Policy</Link>.
              You consent to GatiMitra using your location data during Active Duty to facilitate Services.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Third-Party Services</strong>
            <p className="ml-4">
              The Platform may rely on third-party services (such as maps, payment gateways, and communication
              providers). Your use of those services may be subject to their own terms, and GatiMitra is not
              responsible for their acts, omissions, or availability.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Assignment</strong>
            <p className="ml-4">
              You may not assign or transfer your rights or obligations under this Agreement to any other person.
              GatiMitra may assign this Agreement to any affiliate or successor entity.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Notices</strong>
            <p className="ml-4">
              GatiMitra may send notices to you through the Rider App, SMS, email, or your registered contact
              details, and such notices are deemed received when sent. You must keep your contact details current.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Grievance Redressal</strong>
            <p className="ml-4">
              If you have any complaint or grievance regarding the Platform or this Agreement, you may raise a
              ticket through the Rider App or contact our Grievance Officer at{" "}
              <a href="mailto:partnerhelp@gatimitra.com" className="text-orange-600 hover:underline font-medium">
                partnerhelp@gatimitra.com
              </a>
              . We will acknowledge and endeavour to resolve grievances within the timelines prescribed under
              applicable law.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Governing Law &amp; Disputes</strong>
            <p className="ml-4">
              This Agreement is governed by the laws of India. Subject to any applicable arbitration or dispute-
              resolution mechanism, the competent courts having jurisdiction over GatiMitra&apos;s registered
              office in India shall have exclusive jurisdiction over any disputes.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Changes to Terms</strong>
            <p className="ml-4">
              GatiMitra may amend this Agreement. Material changes will be notified via the Rider App or email.
              Your continued use after notification constitutes acceptance of the revised terms.
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Force Majeure</strong>
            <p className="ml-4">
              Neither party is liable for failure or delay in performance due to causes beyond its reasonable
              control (e.g., acts of God, war, government actions, pandemics).
            </p>
          </li>

          <li className="text-gray-700">
            <strong className="block mb-2 text-lg">Waiver, Severability &amp; Entire Agreement</strong>
            <p className="ml-4">
              This document, together with the policies referenced in it, constitutes the entire agreement between
              us. A failure to enforce any provision is not a waiver of it. If any provision is held invalid, the
              remaining provisions remain in full effect.
            </p>
          </li>
        </ol>

        <p className="mt-8 text-gray-600">
          Related:{" "}
          <Link href="/refund-policy" className="text-orange-600 hover:underline font-medium">Refund Policy</Link>,{" "}
          <Link href="/privacy" className="text-orange-600 hover:underline font-medium">Privacy Policy</Link>, and{" "}
          <Link href="/account-deletion" className="text-orange-600 hover:underline font-medium">Account Deletion</Link>.
        </p>
      </div>
    </div>
    <Footer />
  </>
);

export default Terms;
