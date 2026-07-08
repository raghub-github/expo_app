import Header from "@/components/layout/Header";
import LandingHero from "@/components/home/LandingHero";
import LandingFoodPromise from "@/components/home/LandingFoodPromise";
import LandingAppShowcase from "@/components/home/LandingAppShowcase";
import Footer from "@/components/layout/Footer";

export default function Home() {
  return (
    <main className="landing-page-bg">
      <Header />
      <LandingHero />
      <LandingFoodPromise />
      <LandingAppShowcase />
      <Footer />
    </main>
  );
}
