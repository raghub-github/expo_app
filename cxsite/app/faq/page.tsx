import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('faq');

export default function Page() {
  return <LegalPage slug="faq" />;
}
