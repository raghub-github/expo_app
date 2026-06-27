import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('dpdpa-notice');

export default function Page() {
  return <LegalPage slug="dpdpa-notice" />;
}
