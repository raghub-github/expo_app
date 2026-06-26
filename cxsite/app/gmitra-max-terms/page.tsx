import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('gmitra-max-terms');

export default function Page() {
  return <LegalPage slug="gmitra-max-terms" />;
}
