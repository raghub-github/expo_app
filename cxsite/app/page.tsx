import Header from "@/components/layout/Header";
import BrandSections from "@/components/home/BrandSections";
import Footer from "@/components/layout/Footer";

export default function Home() {
  return (
    <main
      style={{
        background: 'linear-gradient(165deg, #f7f7f7 0%, #f2f2f2 45%, #fafafa 100%)',
      }}
    >
      <Header />
      <BrandSections />
      <Footer />
    </main>
  );
}

