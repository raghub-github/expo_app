'use client'

import Link from 'next/link'
import { GATIMITRA_TAGLINE } from '@/lib/brandTagline'
import GatiMitraLogo from '@/components/common/GatiMitraLogo'
import ParcelServiceControl from '@/components/common/ParcelServiceControl'
import { resolveAndroidDownloadUrl, resolveIosDownloadUrl } from '@/lib/appDownload'
import { AppleStoreIcon, GooglePlayIcon } from '@/components/common/StoreBrandIcons'
import {
  Home,
  UtensilsCrossed,
  Truck,
  Users,
  Tag,
  MapPin,
  Info,
  Newspaper,
  Megaphone,
  Briefcase,
  Handshake,
  ShieldCheck,
  HelpCircle,
  PhoneCall,
  AlertTriangle,
  MessageSquare,
  FileText,
  Lock,
  Send,
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Youtube,
  Trash2,
} from "lucide-react";

type LinkItem = {
  icon: React.ReactNode;
  text: string;
  href: string;
  /** When true, render geo-gated Parcel control instead of a normal link. */
  parcelGated?: boolean;
};

export default function Footer() {
  const androidUrl = resolveAndroidDownloadUrl()
  const iosUrl = resolveIosDownloadUrl()

  const quickLinks: LinkItem[] = [
    { icon: <Home size={14} />, text: "Home", href: "/" },
    { icon: <UtensilsCrossed size={14} />, text: "Food Delivery", href: "/order" },
    { icon: <Truck size={14} />, text: "Parcel Delivery", href: "/parcel", parcelGated: true },
    { icon: <Users size={14} />, text: "Ride and Cab Services", href: "/ride" },
    { icon: <Tag size={14} />, text: "Deals & Offers", href: "/restaurants" },
    { icon: <MapPin size={14} />, text: "Around You", href: "/india/All/Stores" },
  ];

  const company: LinkItem[] = [
    { icon: <Info size={14} />, text: "About Us", href: "/about-us" },
    { icon: <Newspaper size={14} />, text: "Blog", href: "/about-us" },
    { icon: <Megaphone size={14} />, text: "Press", href: "/contact-us" },
    { icon: <Briefcase size={14} />, text: "Careers", href: "/careers" },
    { icon: <Handshake size={14} />, text: "Partners", href: "https://partner.gatimitra.com" },
    { icon: <ShieldCheck size={14} />, text: "Trust & Safety", href: "/safety" },
  ];

  const support: LinkItem[] = [
    { icon: <HelpCircle size={14} />, text: "Help Center", href: "/help-center" },
    { icon: <PhoneCall size={14} />, text: "Contact Us", href: "/contact-us" },
    { icon: <AlertTriangle size={14} />, text: "Report an Issue", href: "/support?type=report" },
    { icon: <MessageSquare size={14} />, text: "Feedback", href: "/support?type=feedback" },
    { icon: <FileText size={14} />, text: "Terms & Conditions", href: "/terms-and-conditions" },
    { icon: <Lock size={14} />, text: "Privacy Policy", href: "/privacy-policy" },
  ];

  const legalBottom: LinkItem[] = [
    { icon: <FileText size={12} />, text: "Sitemap", href: "/sitemap" },
    { icon: <Lock size={12} />, text: "Cookie Policy", href: "/cookies" },
    { icon: <ShieldCheck size={12} />, text: "Accessibility", href: "/accessibility" },
    { icon: <Trash2 size={12} />, text: "Delete Account", href: "/account-deletion" },
    { icon: <FileText size={12} />, text: "Refund Policy", href: "/refund-policy" },
  ];

  // Same official channels as rider.gatimitra.com footer.
  const socials = [
    { icon: <Facebook size={16} />, href: "https://www.facebook.com/pratapsons10", label: "Facebook" },
    { icon: <Linkedin size={16} />, href: "https://www.linkedin.com/in/pratapandsons/", label: "LinkedIn" },
    { icon: <Instagram size={16} />, href: "https://www.instagram.com/gatimitra_on_demand/", label: "Instagram" },
    { icon: <Youtube size={16} />, href: "https://youtube.com/@gatimitrano1?si=RpBFq5tmSjVnOHH3", label: "YouTube" },
    { icon: <Twitter size={16} />, href: "https://twitter.com/gatimitra", label: "Twitter" },
  ];

  return (
    <footer
      id="contact"
      className="bg-gradient-to-br from-[#0c0c1a] to-[#121230] text-white py-12 px-4 md:px-8 relative overflow-hidden scroll-mt-20"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-violet-500 to-pink-500"></div>

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <FooterColumn title="Quick Links">
            {quickLinks.map((l) => (
              <FooterLink key={l.text} {...l} />
            ))}
          </FooterColumn>

          <FooterColumn title="Company">
            {company.map((l) => (
              <FooterLink key={l.text} {...l} />
            ))}
          </FooterColumn>

          <FooterColumn title="Support">
            {support.map((l) => (
              <FooterLink key={l.text} {...l} />
            ))}
          </FooterColumn>

          {/* Stay Connected */}
          <div>
            <h3 className="text-lg font-bold mb-4 text-white relative pb-2">
              Stay Connected
              <span className="absolute bottom-0 left-0 w-8 h-0.5 bg-emerald-400 rounded"></span>
            </h3>
            <div className="mt-4">
              <p className="text-[#b0b0d0] text-[13px] mb-3 leading-relaxed">
                Subscribe to our newsletter for latest updates and exclusive offers.
              </p>
              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex mb-4"
              >
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-2.5 rounded-l-lg bg-white/10 text-white text-[13px] border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                />
                <button
                  type="submit"
                  className="bg-gradient-to-br from-emerald-500 to-violet-600 text-white px-4 rounded-r-lg cursor-pointer font-semibold text-[13px] hover:from-violet-600 hover:to-emerald-500 transition-colors"
                >
                  <Send size={14} />
                </button>
              </form>

              <div className="mt-4">
                <p className="text-[#b0b0d0] text-[13px] mb-2 font-medium">Download our app</p>
                <div className="flex flex-col gap-2">
                  <a
                    href={androidUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Get it on Google Play"
                    className="bg-white/15 rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer transition-all border border-white/10 hover:bg-gradient-to-br hover:from-emerald-500/30 hover:to-violet-600/30 hover:-translate-y-0.5 hover:border-emerald-400"
                  >
                    <GooglePlayIcon className="h-5 w-5 shrink-0 text-white" />
                    <div className="flex flex-col">
                      <span className="text-[10px] opacity-80">GET IT ON</span>
                      <span className="text-sm font-bold">Google Play</span>
                    </div>
                  </a>
                  <a
                    href={iosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Download on the App Store"
                    className="bg-white/15 rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer transition-all border border-white/10 hover:bg-gradient-to-br hover:from-emerald-500/30 hover:to-violet-600/30 hover:-translate-y-0.5 hover:border-emerald-400"
                  >
                    <AppleStoreIcon className="h-5 w-5 shrink-0 text-white" />
                    <div className="flex flex-col">
                      <span className="text-[10px] opacity-80">Download on the</span>
                      <span className="text-sm font-bold">App Store</span>
                    </div>
                  </a>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="w-10 h-10 rounded-lg bg-white/20 text-white transition-all flex items-center justify-center hover:bg-gradient-to-br hover:from-emerald-500 hover:to-violet-600 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(22,194,165,0.3)] border border-white/30"
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <GatiMitraLogo alt="GatiMitra" className="h-9 w-auto object-contain" />
        </div>
        <div className="text-[#a0a0c0] text-[12px] font-medium text-center leading-relaxed">
          <div>© {new Date().getFullYear()} GatiMitra On Demand Services Private Limited</div>
          <div>All rights reserved • {GATIMITRA_TAGLINE}</div>
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {legalBottom.map((l) => (
            <Link
              key={l.text}
              href={l.href}
              className="text-[#b0b0d0] text-[12px] font-medium transition-colors hover:text-emerald-400 inline-flex items-center gap-1"
            >
              {l.text}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          {['VISA', 'MC', 'UPI', 'COD'].map((method) => (
            <div
              key={method}
              className="bg-white/15 w-9 h-6 rounded text-[10px] text-white font-bold flex items-center justify-center transition-all hover:bg-emerald-500 hover:-translate-y-0.5"
            >
              {method}
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-bold mb-4 text-white relative pb-2">
        {title}
        <span className="absolute bottom-0 left-0 w-8 h-0.5 bg-emerald-400 rounded"></span>
      </h3>
      <ul className="list-none space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ icon, text, href, parcelGated }: LinkItem) {
  const isExternal = /^https?:\/\//.test(href);
  const className =
    "text-[#b0b0d0] no-underline transition-all flex items-center text-[14px] font-medium hover:text-emerald-400 hover:translate-x-1";
  const content = (
    <>
      <span className="mr-2 text-emerald-400 w-[18px] flex items-center justify-center">
        {icon}
      </span>
      {text}
    </>
  );
  return (
    <li>
      {parcelGated ? (
        <ParcelServiceControl
          badgePlacement="inline"
          className={className}
          disabledClassName="cursor-not-allowed opacity-45 hover:text-[#b0b0d0] hover:translate-x-0"
        >
          {content}
        </ParcelServiceControl>
      ) : isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          {content}
        </a>
      ) : (
        <Link href={href} className={className}>
          {content}
        </Link>
      )}
    </li>
  );
}
