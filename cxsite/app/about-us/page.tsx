import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('about-us');

export default function Page() {
  return <LegalPage slug="about-us" />;
}
