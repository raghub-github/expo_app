import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('cookies');

export default function Page() {
  return <LegalPage slug="cookies" />;
}
