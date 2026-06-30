import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('dpdpa-compliance-notice');

export default function Page() {
  return <LegalPage slug="dpdpa-compliance-notice" />;
}
