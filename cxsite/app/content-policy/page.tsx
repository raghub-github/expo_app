import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('content-policy');

export default function Page() {
  return <LegalPage slug="content-policy" />;
}
