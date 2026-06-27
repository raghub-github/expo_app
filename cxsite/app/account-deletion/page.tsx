import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('account-deletion');

export default function Page() {
  return <LegalPage slug="account-deletion" />;
}
