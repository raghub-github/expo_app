import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('acceptable-use-policy');

export default function Page() {
  return <LegalPage slug="acceptable-use-policy" />;
}
