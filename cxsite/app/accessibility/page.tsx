import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('accessibility');

export default function Page() {
  return <LegalPage slug="accessibility" />;
}
