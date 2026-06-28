import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('grievance-redressal');

export default function Page() {
  return <LegalPage slug="grievance-redressal" />;
}
