import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('contact-us');

export default function Page() {
  return <LegalPage slug="contact-us" />;
}
