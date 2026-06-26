import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('data-retention-policy');

export default function Page() {
  return <LegalPage slug="data-retention-policy" />;
}
