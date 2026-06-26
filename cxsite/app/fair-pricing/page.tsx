import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('fair-pricing');

export default function Page() {
  return <LegalPage slug="fair-pricing" />;
}
