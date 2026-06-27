import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('lost-and-found');

export default function Page() {
  return <LegalPage slug="lost-and-found" />;
}
