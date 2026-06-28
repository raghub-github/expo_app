import dynamic from 'next/dynamic';

const Careers = dynamic(() => import('../../components/careers/page.jsx'), { ssr: false });

export default function Page() {
  return <Careers />;
}
