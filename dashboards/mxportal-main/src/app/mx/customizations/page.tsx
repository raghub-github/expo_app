import CustomizationForm from '@/components/CustomizationForm';

export default function CustomizationsPage({ searchParams }: any) {
  // itemId should be passed from context/session
  const itemId = searchParams?.item_id || '';
  return (
    <div>
      <h1>Customizations & Add-ons</h1>
      <CustomizationForm itemId={itemId} onSuccess={() => {
        alert('Customization or Add-on added!');
      }} />
    </div>
  );
}
