import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('privacy-policy');

export default function Page() {
  return <LegalPage slug="privacy-policy" />;
}
