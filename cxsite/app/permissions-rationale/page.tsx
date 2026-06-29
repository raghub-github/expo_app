import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('permissions-rationale');

export default function Page() {
  return <LegalPage slug="permissions-rationale" />;
}
