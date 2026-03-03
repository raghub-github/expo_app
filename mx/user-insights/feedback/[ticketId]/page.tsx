'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Star, Loader2, CheckCircle } from 'lucide-react';

export default function TicketFeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params?.ticketId ? parseInt(params.ticketId as string) : null;
  
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<any>(null);

  useEffect(() => {
    if (ticketId) {
      // Fetch ticket info if needed
      fetchTicketInfo();
    }
  }, [ticketId]);

  const fetchTicketInfo = async () => {
    try {
      const res = await fetch(`/api/merchant/tickets/${ticketId}`);
      const data = await res.json();
      if (data.success && data.ticket) {
        setTicketInfo(data.ticket);
        // If already rated, pre-fill
        if (data.ticket.satisfaction_rating) {
          setRating(data.ticket.satisfaction_rating);
          setFeedback(data.ticket.satisfaction_feedback || '');
        }
      }
    } catch (error) {
      console.error('Error fetching ticket:', error);
    }
  };

  const handleSubmit = async () => {
    if (!ticketId || !rating) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/merchant/tickets/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          rating: rating,
          feedback: feedback.trim() || null
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        // Redirect back to user insights after 2 seconds
        setTimeout(() => {
          router.push('/mx/user-insights');
        }, 2000);
      } else {
        alert(data.error || 'Failed to submit feedback');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback');
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank you!</h2>
          <p className="text-gray-600 mb-6">Your feedback has been submitted successfully.</p>
          <p className="text-sm text-gray-500">Redirecting back...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Rate your experience</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6 sm:p-8">
          {/* Question */}
          <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">
            How was your overall experience?
          </h2>
          
          {/* Emoji Rating */}
          <div className="my-8">
            <p className="text-sm text-gray-600 mb-4 text-center">
              How well were we able to solve your problem?
            </p>
            <div className="flex justify-center items-center gap-3 sm:gap-4 flex-wrap">
              {[
                { value: 1, emoji: '😠', label: 'Very Poor' },
                { value: 2, emoji: '😢', label: 'Poor' },
                { value: 3, emoji: '😐', label: 'Neutral' },
                { value: 4, emoji: '😊', label: 'Good' },
                { value: 5, emoji: '😍', label: 'Excellent' }
              ].map(({ value, emoji, label }) => (
                <button
                  key={value}
                  onClick={() => setRating(value)}
                  className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl transition-all duration-200 ${
                    rating === value
                      ? value <= 2
                        ? 'bg-red-50 scale-110 ring-2 ring-red-300'
                        : 'bg-green-50 scale-110 ring-2 ring-green-300'
                      : 'bg-gray-50 hover:bg-gray-100 hover:scale-105'
                  }`}
                >
                  <span className={`text-3xl sm:text-4xl transition-transform ${
                    rating === value ? 'scale-110' : ''
                  }`}>
                    {emoji}
                  </span>
                  <span className={`text-xs sm:text-sm font-medium ${
                    rating === value
                      ? value <= 2 ? 'text-red-700' : 'text-green-700'
                      : 'text-gray-500'
                  }`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Feedback Tags */}
          {rating && rating >= 3 && (
            <div className="mb-6 animate-slide-down">
              <p className="text-sm font-medium text-gray-700 mb-3">What did you like about our support?</p>
              <div className="flex flex-wrap gap-2">
                {['Resolution was fair', 'Quick support', 'Helpful agent', 'Clear communication'].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      if (feedback.includes(tag)) {
                        setFeedback(feedback.replace(tag + ', ', '').replace(', ' + tag, '').replace(tag, ''));
                      } else {
                        setFeedback(prev => prev ? `${prev}, ${tag}` : tag);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      feedback.includes(tag)
                        ? 'bg-orange-100 text-orange-700 border-2 border-orange-300'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Feedback Textarea */}
          <div className="mb-6">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Share your feedback (optional)..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none transition-all"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !rating}
            className={`w-full px-6 py-3 rounded-lg font-medium text-base transition-all duration-200 flex items-center justify-center gap-2 ${
              loading || !rating
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700 shadow-md'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin h-5 w-5" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
