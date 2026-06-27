import LegalPage, { getLegalMetadata } from '@/components/legal/LegalPage';

export const metadata = getLegalMetadata('shipping-delivery-policy');

export default function Page() {
  return <LegalPage slug="shipping-delivery-policy" />;
}
