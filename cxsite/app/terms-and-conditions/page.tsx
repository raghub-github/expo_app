import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('terms-and-conditions');

export default function Page() {
  return <LegalPage slug="terms-and-conditions" />;
}
