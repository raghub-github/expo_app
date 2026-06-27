import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('open-source');

export default function Page() {
  return <LegalPage slug="open-source" />;
}
