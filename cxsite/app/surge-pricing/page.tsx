import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('surge-pricing');

export default function Page() {
  return <LegalPage slug="surge-pricing" />;
}
