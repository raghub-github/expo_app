import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('anti-discrimination');

export default function Page() {
  return <LegalPage slug="anti-discrimination" />;
}
