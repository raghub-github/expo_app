import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('safety');

export default function Page() {
  return <LegalPage slug="safety" />;
}
