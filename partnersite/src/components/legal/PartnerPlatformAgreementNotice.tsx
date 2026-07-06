import Link from 'next/link';

type PartnerPlatformAgreementNoticeProps = {
  variant?: 'dark' | 'light';
  className?: string;
};

const LEGAL_LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/coc', label: 'Code of Conduct' },
] as const;

export function PartnerPlatformAgreementNotice({
  variant = 'light',
  className = '',
}: PartnerPlatformAgreementNoticeProps) {
  const isDark = variant === 'dark';

  return (
    <p
      className={`text-center text-xs leading-relaxed ${
        isDark ? 'text-white/75' : 'text-slate-500'
      } ${className}`}
    >
      By using our platform, you agree to our{' '}
      {LEGAL_LINKS.map((link, index) => (
        <span key={link.href}>
          {index > 0 && <span className={isDark ? 'text-white/50' : 'text-slate-400'}> / </span>}
          <Link
            href={link.href}
            className={
              isDark
                ? 'font-medium text-white/95 underline underline-offset-2 hover:text-white'
                : 'font-medium text-orange-600 underline underline-offset-2 hover:text-orange-700'
            }
          >
            {link.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
