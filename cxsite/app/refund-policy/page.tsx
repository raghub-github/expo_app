import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('refund-policy');

export default function Page() {
  return <LegalPage slug="refund-policy" />;
}
