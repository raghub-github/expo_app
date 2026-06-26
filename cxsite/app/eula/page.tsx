import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('eula');

export default function Page() {
  return <LegalPage slug="eula" />;
}
