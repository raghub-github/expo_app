// import Header from '../../components/Header';
import Navbar from "@/components/Navbar";
// import Footer from '../../components/Footer';
import Footer from "@/components/Footer";
// import ReviewsSection from '../../components/ReviewsSection';
import ReviewsSection from "@/components/ReviewsSection";
export default function ReviewsPage() {
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 pt-20 pb-10">
        <ReviewsSection showAll={true} />
      </div>
      <Footer />
    </>
  );
}
