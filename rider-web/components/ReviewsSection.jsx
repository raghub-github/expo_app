'use client';
import { useState, useEffect, useCallback, memo } from 'react';
import StarRating from './StarRating';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaChevronLeft, 
  FaChevronRight, 
  FaCalendarAlt, 
  FaPenAlt,
  FaTimes,
  FaQuoteLeft,
  FaQuoteRight,
  FaStar,
  FaCheckCircle,
  FaExpandAlt,
  FaTimesCircle,
  FaEye,
  FaUserCheck,
  FaCommentAlt,
  FaExclamationTriangle,
  FaThumbsUp,
  FaUser,
  FaEdit,
  FaClock,
  FaShieldAlt
} from 'react-icons/fa';
import Link from 'next/link';

// Memoized Review Card for performance
const ReviewCard = memo(({ review, formatDate, onViewMore, onShowResponse }) => {
  const isLongReview = review.review.length > 120;

  return (
    <div className="relative group">
      <div className="relative overflow-hidden bg-gray-900 rounded-xl p-4 shadow-lg border border-gray-800/80 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 hover:border-red-500/30">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-red-900/5 to-teal-900/5"></div>
        
        <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-red-500/30 rounded-tl-xl"></div>
        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-2 border-r-2 border-teal-500/30 rounded-br-xl"></div>
        
        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-teal-500 flex items-center justify-center shadow-md ring-2 ring-gray-800/20">
          <FaQuoteLeft className="text-white text-xs" />
        </div>
        
        <div className="relative z-10 flex items-start gap-3 mb-3 pb-3 border-b border-gray-800/80">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 via-purple-500 to-teal-500 p-0.5 shadow-md">
              <div className="w-full h-full rounded-full bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                  {review.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
            
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-400 flex items-center justify-center shadow ring-2 ring-gray-900">
              <div className="flex flex-col items-center justify-center">
                <span className="text-[10px] font-black text-gray-900 leading-none">{review.stars}.0</span>
                <div className="flex -mt-0.5">
                  {[...Array(Math.floor(review.stars))].map((_, i) => (
                    <FaStar key={i} className="w-1.5 h-1.5 text-gray-900 fill-gray-900" />
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="font-bold text-sm text-white truncate">
                {review.name}
              </h3>
              <FaCheckCircle className="text-teal-500 flex-shrink-0 ml-1 w-3.5 h-3.5" />
            </div>
            
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <FaCalendarAlt className="flex-shrink-0 w-2.5 h-2.5" />
              <span>{formatDate(review.created_at)}</span>
              <span className="font-medium px-1.5 py-0.5 rounded-full bg-gradient-to-r from-red-900/20 to-teal-900/20">
                Verified
              </span>
            </div>
          </div>
        </div>
        
        <div className="relative z-10 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <FaStar
                  key={i}
                  className={`text-sm ${
                    i < review.stars
                      ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_1px_2px_rgba(250,204,21,0.3)]'
                      : 'text-gray-700 fill-gray-700'
                  } transition-all duration-300`}
                />
              ))}
            </div>
            <span className="text-sm font-bold text-white">
              {review.stars.toFixed(1)}
            </span>
          </div>
          
          <div className="relative">
            <p className="text-gray-300 leading-snug text-sm mb-3 line-clamp-2">
              "{review.review}"
            </p>
            <div className="absolute bottom-0 right-0 text-gray-800">
              <FaQuoteRight className="text-lg" />
            </div>
          </div>

          {review.hasResponse && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => onShowResponse(review)}
                className="inline-flex items-center gap-1 text-xs font-medium bg-gradient-to-r from-teal-600 to-blue-600 text-transparent bg-clip-text hover:from-teal-500 hover:to-blue-500 transition-all duration-300"
              >
                <FaCommentAlt className="text-[10px]" />
                <span>View Our Response</span>
              </button>
            </div>
          )}

          {isLongReview && (
            <div className="mt-2">
              <button
                onClick={() => onViewMore(review)}
                className="inline-flex items-center gap-1 text-xs font-medium bg-gradient-to-r from-red-600 to-teal-600 text-transparent bg-clip-text hover:from-red-500 hover:to-teal-500 transition-all duration-300"
              >
                <FaExpandAlt className="text-[10px]" />
                <span>View Full Review</span>
              </button>
            </div>
          )}
        </div>
        
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-24 h-0.5 bg-gradient-to-r from-red-500 via-purple-500 to-teal-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </div>
    </div>
  );
});

ReviewCard.displayName = 'ReviewCard';

export default function ReviewsSection({ showAll = false }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ 
    name: '', 
    email: '', 
    stars: 5, 
    review: '' 
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [showResponse, setShowResponse] = useState(false);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const reviewsToShow = showAll ? reviews : reviews.slice(0, 8);
  const visibleCount = showAll ? reviewsToShow.length : 3;
  const totalPages = Math.ceil(reviewsToShow.length / visibleCount);
  const displayedReviews = showAll 
    ? reviewsToShow.map(review => ({ 
        ...review, 
        hasResponse: review.response_by && review.response_message 
      })) 
    : reviewsToShow.slice(currentIndex, currentIndex + visibleCount).map(review => ({ 
        ...review, 
        hasResponse: review.response_by && review.response_message 
      }));

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const url = `/api/reviews?t=${Date.now()}`;
      
      const cache = sessionStorage.getItem('reviews_cache');
      if (cache) {
        const cachedData = JSON.parse(cache);
        if (Date.now() - cachedData.timestamp < 30000) {
          setReviews(cachedData.data);
          setLoading(false);
        }
      }

      const res = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        const reviewsData = data.data.map(review => ({
          ...review,
          hasResponse: review.response_by && review.response_message ? true : false
        }));
        setReviews(reviewsData);
        sessionStorage.setItem('reviews_cache', JSON.stringify({
          data: reviewsData,
          timestamp: Date.now()
        }));
      } else {
        throw new Error(data.error || 'Failed to fetch reviews');
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
      setError('Failed to load reviews. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    let mounted = true;
    
    const loadReviews = async () => {
      await fetchReviews();
    };

    loadReviews();

    return () => {
      mounted = false;
    };
  }, [fetchReviews]);

  const handleChange = useCallback((e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }, []);

  const handleStarChange = useCallback((stars) => {
    setForm(prev => ({ ...prev, stars }));
    setError('');
  }, []);

  const validateForm = useCallback(() => {
    if (!form.name.trim()) {
      return 'Name is required';
    }
    if (form.name.trim().length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (!form.email.trim()) {
      return 'Email is required';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return 'Please enter a valid email address';
    }
    if (!form.review.trim() || form.review.length < 10) {
      return 'Review must be at least 10 characters long';
    }
    if (form.review.length > 1000) {
      return 'Review must be less than 1000 characters';
    }
    if (form.stars < 1 || form.stars > 5) {
      return 'Please select a valid rating';
    }
    return null;
  }, [form]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Client-side validation
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    console.log('Submitting review:', form);

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          stars: Number(form.stars),
          review: form.review.trim()
        }),
      });
      
      console.log('Response status:', res.status);
      const data = await res.json();
      console.log('Response data:', data);
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Error ${res.status}: Failed to submit review`);
      } else {
        setSuccess(true);
        setForm({ name: '', email: '', stars: 5, review: '' });
        sessionStorage.removeItem('reviews_cache');
        
        // Fetch fresh reviews immediately
        await fetchReviews();
        
        // Close modal after delay
        setTimeout(() => {
          setSuccess(false);
          setShowFormModal(false);
        }, 2000);
      }
    } catch (err) {
      console.error('Submission error:', err);
      setError(err.message || 'Network error. Please check your connection and try again.');
      
      // Auto-reset submitting state on error after 5 seconds
      setTimeout(() => {
        if (submitting) {
          setSubmitting(false);
          setError('Submission timeout. Please try again.');
        }
      }, 5000);
    } finally {
      // Keep submitting state true for success message display
      if (!success) {
        setSubmitting(false);
      }
    }
  }, [form, fetchReviews, validateForm, submitting, success]);

  const maxStartIndex = totalPages > 1 ? (totalPages - 1) * visibleCount : 0;

  const nextSlide = useCallback(() => {
    if (showAll || reviewsToShow.length <= visibleCount || totalPages <= 1) return;
    setCurrentIndex(prev => {
      const nextStart = prev + visibleCount;
      return nextStart >= reviewsToShow.length ? 0 : nextStart;
    });
  }, [showAll, reviewsToShow.length, visibleCount, totalPages]);

  const prevSlide = useCallback(() => {
    if (showAll || reviewsToShow.length <= visibleCount || totalPages <= 1) return;
    setCurrentIndex(prev => {
      const prevStart = prev - visibleCount;
      return prevStart < 0 ? maxStartIndex : prevStart;
    });
  }, [showAll, reviewsToShow.length, visibleCount, totalPages, maxStartIndex]);

  const goToPage = useCallback((pageIndex) => {
    if (showAll || reviewsToShow.length <= visibleCount) return;
    const newIndex = Math.min(pageIndex * visibleCount, maxStartIndex);
    setCurrentIndex(newIndex);
  }, [showAll, reviewsToShow.length, visibleCount, maxStartIndex]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  }, []);

  const openFormModal = useCallback(() => {
    setShowFormModal(true);
    setError('');
    setSuccess(false);
  }, []);

  const closeFormModal = useCallback(() => {
    setShowFormModal(false);
    setError('');
    setSuccess(false);
    setForm({ name: '', email: '', stars: 5, review: '' });
  }, []);

  const openReviewModal = useCallback((review) => {
    setSelectedReview(review);
    setShowResponse(false);
  }, []);

  const openResponseModal = useCallback((review) => {
    setSelectedReview(review);
    setShowResponse(true);
  }, []);

  const closeReviewModal = useCallback(() => {
    setSelectedReview(null);
    setShowResponse(false);
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (selectedReview) {
          closeReviewModal();
        }
        if (showFormModal) {
          closeFormModal();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedReview, showFormModal, closeReviewModal, closeFormModal]);

  // Calculate statistics
  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length).toFixed(1)
    : '0.0';
    
  const totalReviews = reviews.length;
  const fiveStarReviews = reviews.filter(r => r.stars === 5).length;
  const fiveStarPercentage = totalReviews > 0 ? Math.round((fiveStarReviews / totalReviews) * 100) : 0;

  if (loading && reviews.length === 0) {
    return (
      <div className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-gray-800 rounded-2xl h-80"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section id="reviews" className="py-10 px-4 scroll-mt-20 bg-gradient-to-b from-black to-gray-900">
      <div className="max-w-7xl mx-auto">
        
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 mb-2">
            <FaStar className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs font-medium text-orange-300">User Feedback</span>
          </div>
          
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              What Our
            </span>{' '}
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              Users Say
            </span>
          </h2>
          
          <p className="text-gray-400 text-sm max-w-xl mx-auto">
            Join thousands of satisfied customers sharing their experiences with GatiMitra
          </p>
        </div>

        {/* Compact Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center flex-shrink-0">
                <FaStar className="text-white text-xs" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-white truncate">{averageRating}</div>
                <div className="text-[10px] text-gray-400 truncate">Avg Rating</div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center flex-shrink-0">
                <FaUser className="text-white text-xs" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-white truncate">{totalReviews}</div>
                <div className="text-[10px] text-gray-400 truncate">Total Reviews</div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-600 to-teal-500 flex items-center justify-center flex-shrink-0">
                <FaThumbsUp className="text-white text-xs" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-white truncate">{fiveStarPercentage}%</div>
                <div className="text-[10px] text-gray-400 truncate">5 Star</div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center flex-shrink-0">
                <FaShieldAlt className="text-white text-xs" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-white truncate">100%</div>
                <div className="text-[10px] text-gray-400 truncate">Verified</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={openFormModal}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl hover:shadow-red-500/20 transition-all duration-300 group"
          >
            <FaPenAlt className="text-sm group-hover:rotate-12 transition-transform duration-300" />
            <span>Rate Us</span>
          </motion.button>
        </div>

        {reviews.length === 0 ? (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-red-900/20 to-orange-900/20 flex items-center justify-center">
                <FaPenAlt className="text-2xl text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                No Reviews Yet
              </h3>
              <p className="text-gray-400 mb-6 max-w-sm mx-auto">
                Be the first to share your experience and help others make informed decisions.
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={openFormModal}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl hover:shadow-red-500/20 transition-all duration-300 group"
              >
                <FaPenAlt className="text-sm group-hover:rotate-12 transition-transform duration-300" />
                <span>Be the First to Review</span>
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className={`grid ${showAll ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'grid-cols-1 md:grid-cols-3 gap-4'}`}>
              <AnimatePresence mode="wait">
                {displayedReviews.map((review) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                  >
                    <ReviewCard 
                      review={review} 
                      formatDate={formatDate} 
                      onViewMore={openReviewModal}
                      onShowResponse={openResponseModal}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {!showAll && reviewsToShow.length > visibleCount && (
              <div className="flex justify-center items-center gap-6 mt-6">
                <motion.button
                  whileHover={{ scale: 1.1, x: -2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={prevSlide}
                  className="p-3 rounded-full bg-gradient-to-r from-red-600 to-orange-500 text-white hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 shadow-md group"
                  aria-label="Previous reviews"
                >
                  <FaChevronLeft className="text-base group-hover:-translate-x-0.5 transition-transform duration-300" />
                </motion.button>
                
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const currentPage = Math.floor(currentIndex / visibleCount);
                    return (
                      <button
                        key={i}
                        onClick={() => goToPage(i)}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          currentPage === i 
                            ? 'w-8 bg-gradient-to-r from-red-600 to-orange-500 shadow-md' 
                            : 'w-2 bg-gray-700 hover:bg-gray-600'
                        }`}
                        aria-label={`Go to page ${i + 1}`}
                      />
                    );
                  })}
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.1, x: 2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={nextSlide}
                  className="p-3 rounded-full bg-gradient-to-r from-red-600 to-orange-500 text-white hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 shadow-md group"
                  aria-label="Next reviews"
                >
                  <FaChevronRight className="text-base group-hover:translate-x-0.5 transition-transform duration-300" />
                </motion.button>
              </div>
            )}
          </div>
        )}
        
        {!showAll && reviews.length > 0 && (
          <div className="text-center mt-8 pt-4 border-t border-gray-800">
            <Link 
              href="/reviews"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl hover:shadow-red-500/20 transition-all duration-300 group"
            >
              <FaEye className="text-base group-hover:scale-110 transition-transform duration-300" />
              <span>View All Reviews ({reviews.length})</span>
            </Link>
            <p className="text-gray-400 text-sm mt-3">
              Explore all customer experiences and share your own
            </p>
          </div>
        )}
      </div>

      {/* Unified Modal for Both Full Review and Response */}
      <AnimatePresence>
        {selectedReview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeReviewModal}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-gray-900 rounded-xl shadow-2xl border border-gray-800 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 bg-gradient-to-r from-red-600 to-orange-500 text-white p-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/20 to-transparent p-1">
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white font-bold text-lg">
                          {selectedReview.name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">
                        {showResponse ? "Our Response" : `${selectedReview.name}'s Review`}
                      </h3>
                      <div className="flex items-center gap-2 text-red-100/90 text-sm mt-1">
                        <FaCalendarAlt className="w-3 h-3" />
                        <span>{formatDate(selectedReview.created_at)}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/20">
                          Verified
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={closeReviewModal}
                    className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-all duration-200 hover:rotate-90"
                    aria-label="Close modal"
                  >
                    <FaTimesCircle className="text-lg" />
                  </button>
                </div>

                {/* Toggle between Review and Response */}
                {selectedReview.hasResponse && (
                  <div className="flex mt-4">
                    <button
                      onClick={() => setShowResponse(false)}
                      className={`flex-1 py-2 text-sm font-medium rounded-l-lg transition-all duration-300 ${
                        !showResponse 
                          ? 'bg-white/30 text-white' 
                          : 'bg-white/10 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      Review
                    </button>
                    <button
                      onClick={() => setShowResponse(true)}
                      className={`flex-1 py-2 text-sm font-medium rounded-r-lg transition-all duration-300 ${
                        showResponse 
                          ? 'bg-white/30 text-white' 
                          : 'bg-white/10 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      Our Response
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Content */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {showResponse ? (
                  // Response View
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-teal-900/20 to-blue-900/20 rounded-xl p-5 border border-teal-800/50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center">
                          <FaUserCheck className="text-white text-lg" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white">
                            Response from {selectedReview.response_by || 'GatiMitra Team'}
                          </h4>
                          <p className="text-sm text-gray-400">
                            Official Response
                          </p>
                        </div>
                      </div>
                      
                      <div className="relative pl-4 border-l-2 border-teal-500">
                        <div className="absolute top-0 left-0 -translate-x-2 -translate-y-2 text-teal-500/20">
                          <FaQuoteLeft className="text-3xl" />
                        </div>
                        <p className="text-gray-200 text-lg leading-relaxed whitespace-pre-line">
                          {selectedReview.response_message}
                        </p>
                        <div className="flex justify-end mt-2">
                          <div className="text-teal-500/20">
                            <FaQuoteRight className="text-3xl" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Original Review Summary */}
                    <div className="bg-gray-800/50 rounded-xl p-4">
                      <h5 className="font-semibold text-gray-300 mb-2 flex items-center gap-2">
                        <FaStar className="text-amber-500" />
                        Original Review Summary
                      </h5>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <FaStar
                              key={i}
                              className={`text-sm ${
                                i < selectedReview.stars
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-700 fill-gray-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-medium text-gray-300">
                          {selectedReview.stars.toFixed(1)}/5
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm line-clamp-2">
                        "{selectedReview.review}"
                      </p>
                    </div>
                  </div>
                ) : (
                  // Full Review View
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <FaStar
                              key={i}
                              className={`text-xl ${
                                i < selectedReview.stars
                                  ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_2px_4px_rgba(250,204,21,0.3)]'
                                  : 'text-gray-700 fill-gray-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xl font-bold text-white">
                          {selectedReview.stars.toFixed(1)} out of 5
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">
                        Full Review
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute top-0 left-0 -translate-x-4 -translate-y-4 text-red-500/10">
                        <FaQuoteLeft className="text-5xl" />
                      </div>
                      <div className="absolute bottom-0 right-0 translate-x-4 translate-y-4 text-orange-500/10">
                        <FaQuoteRight className="text-5xl" />
                      </div>
                      
                      <div className="relative z-10">
                        <p className="text-gray-200 text-lg leading-relaxed whitespace-pre-line">
                          {selectedReview.review}
                        </p>
                      </div>
                    </div>

                    {/* Show Response Button in Full Review */}
                    {selectedReview.hasResponse && (
                      <div className="mt-8 pt-4 border-t border-gray-800">
                        <button
                          onClick={() => setShowResponse(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-md hover:shadow-teal-500/20 transition-all duration-300 group"
                        >
                          <FaCommentAlt className="group-hover:scale-110 transition-transform duration-300" />
                          <span>View Our Response</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="sticky bottom-0 bg-gradient-to-r from-gray-900/90 to-gray-900/80 backdrop-blur-sm border-t border-gray-800 p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <FaClock className="w-3 h-3" />
                    <span>{formatDate(selectedReview.created_at)}</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={closeReviewModal}
                      className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-500 text-white font-medium rounded-lg shadow hover:shadow-md hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-[1.02]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review Form Modal */}
      <AnimatePresence>
        {showFormModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeFormModal}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-gray-900 rounded-xl shadow-2xl border border-gray-800 overflow-hidden"
            >
              <div className="sticky top-0 z-10 bg-gradient-to-r from-red-600 to-orange-500 text-white p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold">Rate Us</h3>
                    <p className="text-red-100/80 text-xs mt-0.5">Your honest feedback helps our community</p>
                  </div>
                  <button
                    onClick={closeFormModal}
                    className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-all duration-200 hover:rotate-90"
                    aria-label="Close modal"
                  >
                    <FaTimes className="text-base" />
                  </button>
                </div>
              </div>

              <div className="p-5 max-h-[65vh] overflow-y-auto">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="name" className="block text-xs font-semibold text-gray-300 mb-1">
                        Your Name *
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Your name"
                        required
                        minLength={2}
                        maxLength={100}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                        disabled={submitting}
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-xs font-semibold text-gray-300 mb-1">
                        Your Email *
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="your@email.com"
                        required
                        pattern="[^@\s]+@[^@\s]+\.[^@\s]+"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-2">
                      Your Rating *
                    </label>
                    <div className="p-3 rounded-lg border border-gray-700 bg-gray-800/50">
                      <StarRating
                        value={form.stars}
                        onChange={handleStarChange}
                        size="md"
                        showLabel
                        disabled={submitting}
                      />
                      <p className="mt-2 text-xs text-center text-gray-400">
                        {form.stars === 5 ? 'Excellent!' : 
                         form.stars === 4 ? 'Great!' : 
                         form.stars === 3 ? 'Good' : 
                         form.stars === 2 ? 'Fair' : 'Poor'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="review" className="block text-xs font-semibold text-gray-300 mb-1">
                      Your Review *
                    </label>
                    <textarea
                      id="review"
                      name="review"
                      value={form.review}
                      onChange={handleChange}
                      placeholder="Share your experience..."
                      required
                      minLength={10}
                      maxLength={1000}
                      rows={3}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all resize-none"
                      disabled={submitting}
                    />
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-gray-500">
                        Be honest and helpful
                      </p>
                      <span className={`text-xs font-medium ${
                        form.review.length > 900 ? 'text-red-400' : 
                        form.review.length > 700 ? 'text-amber-400' : 
                        'text-gray-500'
                      }`}>
                        {form.review.length} / 1000
                      </span>
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-2.5 bg-red-900/20 border border-red-800 rounded-lg"
                    >
                      <p className="text-red-400 text-xs font-medium flex items-center gap-1.5">
                        <FaExclamationTriangle className="text-xs" />
                        {error}
                      </p>
                    </motion.div>
                  )}

                  {success && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-2.5 bg-green-900/20 border border-green-800 rounded-lg"
                    >
                      <p className="text-green-400 text-xs font-medium flex items-center gap-1.5">
                        <FaCheckCircle className="text-xs" />
                        Thank you! Your review has been submitted successfully.
                      </p>
                    </motion.div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeFormModal}
                      disabled={submitting}
                      className="flex-1 py-2.5 px-4 border border-gray-600 text-gray-300 font-medium text-sm rounded-lg hover:bg-gray-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2.5 px-4 bg-gradient-to-r from-red-600 to-orange-500 text-white font-medium text-sm rounded-lg shadow hover:shadow-md hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Submitting...
                        </>
                      ) : (
                        'Submit Review'
                      )}
                    </button>
                  </div>
                  
                  {submitting && !error && (
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mt-2">
                        Please wait while we submit your review...
                      </p>
                    </div>
                  )}
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}