import Header from "@/components/layout/Header";
import LandingHero from "@/components/home/LandingHero";
import BrandSections from "@/components/home/BrandSections";
import Footer from "@/components/layout/Footer";

export default function Home() {
  return (
    <main className="landing-page-bg">
      <Header />
      <LandingHero />
      <BrandSections />
      <Footer />
    </main>
  );
}
