import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('childrens-privacy');

export default function Page() {
  return <LegalPage slug="childrens-privacy" />;
}
