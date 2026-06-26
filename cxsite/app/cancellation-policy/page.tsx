import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('cancellation-policy');

export default function Page() {
  return <LegalPage slug="cancellation-policy" />;
}
