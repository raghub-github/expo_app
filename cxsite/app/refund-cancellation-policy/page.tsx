import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('refund-cancellation-policy');

export default function Page() {
  return <LegalPage slug="refund-cancellation-policy" />;
}
