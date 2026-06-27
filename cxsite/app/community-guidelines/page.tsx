import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('community-guidelines');

export default function Page() {
  return <LegalPage slug="community-guidelines" />;
}
