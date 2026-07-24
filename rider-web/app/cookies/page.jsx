'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function CookiesPage() {
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
              Cookie Policy
            </h1>
          </div>
          <p className="mb-2 font-semibold text-gray-700">Effective Date: 13-02-2026</p>
          <p className="mb-6 text-gray-600 leading-relaxed">
            GatiMitra On-Demand Services Pvt. Ltd. (&quot;GatiMitra&quot;, &quot;we&quot;, &quot;us&quot;) uses cookies and similar technologies on our website and apps. This policy explains what cookies are, how we use them, and your choices.
          </p>

          <ol className="list-decimal pl-6 space-y-6 text-gray-700">
            <li>
              <strong className="block mb-2 text-lg">What are cookies?</strong>
              <p className="ml-4">
                Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences, improve performance, and understand how you use our services.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Types of cookies we use</strong>
              <div className="ml-4 space-y-2">
                <p><b>Essential cookies:</b> Required for the website to function (e.g. login, security, load balancing).</p>
                <p><b>Analytics cookies:</b> Help us understand how visitors use our site (e.g. pages visited, time spent).</p>
                <p><b>Preference cookies:</b> Remember your settings (e.g. language, region).</p>
                <p><b>Marketing cookies:</b> Used to deliver relevant ads and measure campaign effectiveness (optional).</p>
              </div>
            </li>
            <li>
              <strong className="block mb-2 text-lg">How long we keep cookies</strong>
              <p className="ml-4">
                Session cookies are deleted when you close the browser. Persistent cookies remain for a set period (e.g. 30 days to 1 year) unless you clear them or withdraw consent.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Your choices</strong>
              <p className="ml-4">
                You can block or delete cookies via your browser settings. Note that blocking essential cookies may affect site functionality. You may also manage your cookie preferences through our consent banner or by contacting us at partnerhelp@gatimitra.com.
              </p>
            </li>
            <li>
              <strong className="block mb-2 text-lg">Updates</strong>
              <p className="ml-4">
                We may update this Cookie Policy from time to time. The &quot;Effective Date&quot; at the top will reflect the latest version. Continued use of our services after changes means you accept the updated policy.
              </p>
            </li>
          </ol>

          <p className="mt-8 text-gray-600">
            For more information, see our <Link href="/terms" className="text-orange-600 hover:underline font-medium">Terms and Conditions</Link> and <a href="/#contact" className="text-orange-600 hover:underline font-medium">Contact</a> section.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
