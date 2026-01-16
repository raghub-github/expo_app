
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from 'next/dynamic';

const ParentMerchantForm = dynamic(() => import('@/components/ParentMerchantForm'), { ssr: false });

export default function RegisterParentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams?.get("phone") || "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-1 py-2">
      <div className="w-full max-w-md p-4 rounded-2xl shadow-xl bg-white/98 border border-blue-100 backdrop-blur-lg flex flex-col gap-4" style={{maxHeight:'98vh'}}>
        <div className="flex flex-col items-center gap-1 mb-2">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-full shadow mb-1">
            <svg xmlns='http://www.w3.org/2000/svg' className='h-8 w-8 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M16 7a4 4 0 01-8 0M12 3v4m0 0a4 4 0 01-4 4m4-4a4 4 0 014 4m-4 4v4m0 0a4 4 0 01-4 4m4-4a4 4 0 014 4' /></svg>
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 text-center leading-tight">Register Business / Brand</h2>
        </div>
        <ParentMerchantForm
          verifiedPhone={phone}
          onSuccess={(data) => {
            router.push(`/auth/register-store?parent_id=${data.parent_merchant_id || ""}`);
          }}
        />
      </div>
    </div>
  );
}
