'use client';
import React, { useState, useEffect } from 'react';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { 
  Star, 
  MessageSquare, 
  AlertTriangle, 
  Send, 
  UserCheck, 
  UserPlus, 
  UserX, 
  Filter,
  Calendar,
  CheckCircle
} from 'lucide-react';

const dummyReviews = [
  {
    id: 1,
    user: 'Amit Kumar',
    date: '2026-01-10',
    type: 'Review',
    message: 'Great food and fast delivery! The biryani was perfectly spiced and arrived steaming hot. Highly recommended for family dinners.',
    response: 'Thank you for your feedback, Amit! We\'re thrilled you enjoyed our biryani. We look forward to serving you again soon!',
    userType: 'repeated',
    rating: 5,
    orderCount: 12
  },
  {
    id: 2,
    user: 'Priya Singh',
    date: '2026-01-09',
    type: 'Complaint',
    message: 'Order was delayed by 45 minutes and food arrived cold. Very disappointing experience for a special occasion.',
    response: '',
    userType: 'new',
    orderCount: 1
  },
  {
    id: 3,
    user: 'Rahul Sharma',
    date: '2026-01-08',
    type: 'Review',
    message: 'The desserts were absolutely fantastic! The chocolate lava cake was rich and gooey, exactly as described. Will definitely order again.',
    response: 'Glad you enjoyed it, Rahul! Our pastry chef will be delighted to hear your feedback about the lava cake.',
    userType: 'repeated',
    rating: 4,
    orderCount: 8
  },
  {
    id: 4,
    user: 'Sneha Verma',
    date: '2026-01-07',
    type: 'Complaint',
    message: 'Received the wrong item in my order - ordered paneer tikka but got chicken tikka instead. As a vegetarian, this was very upsetting.',
    response: 'We sincerely apologize for this serious error, Sneha. We\'ve addressed this with our kitchen team and will offer a full refund plus credit for your next order.',
    userType: 'fraud',
    orderCount: 3,
    fraudFlag: 'Multiple refund requests'
  },
  {
    id: 5,
    user: 'Raj Patel',
    date: '2026-01-06',
    type: 'Review',
    message: 'Consistently excellent quality across multiple orders. The packaging is always secure and the delivery team is polite.',
    response: 'Thank you for being a loyal customer, Raj! We appreciate your continued trust in our service.',
    userType: 'repeated',
    rating: 5,
    orderCount: 25
  },
  {
    id: 6,
    user: 'Neha Gupta',
    date: '2026-01-05',
    type: 'Complaint',
    message: 'Missing one item from my order of 5 dishes. Customer service was responsive but still inconvenient.',
    response: 'We\'re sorry for the incomplete order, Neha. The missing item has been refunded and we\'ve added bonus credit to your account.',
    userType: 'new',
    orderCount: 2
  },
  {
    id: 7,
    user: 'Vikram Joshi',
    date: '2026-01-04',
    type: 'Review',
    message: 'Excellent value for money. The lunch combo is perfect for office meals. Keep up the good work!',
    response: '',
    userType: 'repeated',
    rating: 4,
    orderCount: 15
  },
  {
    id: 8,
    user: 'Anjali Desai',
    date: '2026-01-03',
    type: 'Complaint',
    message: 'Food quality has declined over the last two orders. The butter chicken lacked the usual richness and creaminess.',
    response: 'Thank you for bringing this to our attention, Anjali. Our head chef is investigating and we\'ll reach out personally.',
    userType: 'repeated',
    orderCount: 18
  }
];

const SkeletonRow = () => (
  <div className="animate-pulse bg-white rounded-xl border border-gray-100 p-6 mb-4 shadow-sm">
    <div className="flex items-start justify-between">
      <div className="space-y-3 flex-1">
        <div className="flex items-center gap-3">
          <div className="h-6 bg-gray-200 rounded w-32"></div>
          <div className="h-5 bg-gray-200 rounded w-24"></div>
        </div>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-full mb-1"></div>
        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
      </div>
      <div className="h-8 bg-gray-200 rounded w-24 ml-4"></div>
    </div>
  </div>
);

const UserInsightsPage = () => {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState(dummyReviews);
  const [responseText, setResponseText] = useState({});
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    reviews: 0,
    complaints: 0,
    repeatedUsers: 0,
    newUsers: 0,
    fraudUsers: 0
  });

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1200);
    
    // Calculate stats
    const total = dummyReviews.length;
    const reviews = dummyReviews.filter(r => r.type === 'Review').length;
    const complaints = dummyReviews.filter(r => r.type === 'Complaint').length;
    const repeatedUsers = dummyReviews.filter(r => r.userType === 'repeated').length;
    const newUsers = dummyReviews.filter(r => r.userType === 'new').length;
    const fraudUsers = dummyReviews.filter(r => r.userType === 'fraud').length;
    
    setStats({ total, reviews, complaints, repeatedUsers, newUsers, fraudUsers });
    
    return () => clearTimeout(timer);
  }, []);

  const handleResponseChange = (id, value) => {
    setResponseText((prev) => ({ ...prev, [id]: value }));
  };

  const handleSendResponse = (id) => {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, response: responseText[id] || '' } : r
      )
    );
    setResponseText((prev) => ({ ...prev, [id]: '' }));
  };

  const filteredReviews = filter === 'all' 
    ? reviews 
    : filter === 'review' 
    ? reviews.filter(r => r.type === 'Review')
    : reviews.filter(r => r.type === 'Complaint');

  const getUserTypeTag = (userType, fraudFlag = '') => {
    const config = {
      repeated: { 
        icon: <UserCheck size={14} />, 
        text: 'Repeated User', 
        bg: 'bg-blue-50', 
        textColor: 'text-blue-700',
        border: 'border-blue-100'
      },
      new: { 
        icon: <UserPlus size={14} />, 
        text: 'New User', 
        bg: 'bg-green-50', 
        textColor: 'text-green-700',
        border: 'border-green-100'
      },
      fraud: { 
        icon: <UserX size={14} />, 
        text: fraudFlag || 'Fraud Risk', 
        bg: 'bg-red-50', 
        textColor: 'text-red-700',
        border: 'border-red-100'
      }
    };
    
    const tag = config[userType];
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${tag.bg} ${tag.textColor} ${tag.border} border`}>
        {tag.icon}
        {tag.text}
      </span>
    );
  };

  const getReviewTypeTag = (type) => {
    return type === 'Review' ? (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
        <Star size={12} />
        Review
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
        <AlertTriangle size={12} />
        Complaint
      </span>
    );
  };

  return (
    <MXLayoutWhite>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">User Insights Dashboard</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar size={16} />
              <span>Last updated: Today, 10:30 AM</span>
            </div>
          </div>
          <p className="text-gray-600">Monitor customer feedback, respond to reviews, and analyze user behavior patterns.</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Total Feedback</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-sm text-gray-500 mb-1 flex items-center gap-1">
              <Star size={14} />
              Reviews
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.reviews}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-sm text-gray-500 mb-1 flex items-center gap-1">
              <AlertTriangle size={14} />
              Complaints
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.complaints}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Repeated Users</div>
            <div className="text-2xl font-bold text-blue-600">{stats.repeatedUsers}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">New Users</div>
            <div className="text-2xl font-bold text-green-600">{stats.newUsers}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Fraud Risks</div>
            <div className="text-2xl font-bold text-red-600">{stats.fraudUsers}</div>
          </div>
        </div>

        {/* Navigation Filters */}
        <div className="flex flex-wrap items-center justify-between mb-6">
          <div className="flex space-x-1 mb-4 md:mb-0">
            <button
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
              onClick={() => setFilter('all')}
            >
              All Feedback
            </button>
            <button
              className={`px-5 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${filter === 'review' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
              onClick={() => setFilter('review')}
            >
              <Star size={14} />
              Reviews
            </button>
            <button
              className={`px-5 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${filter === 'complaint' ? 'bg-amber-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
              onClick={() => setFilter('complaint')}
            >
              <AlertTriangle size={14} />
              Complaints
            </button>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter size={16} />
            <span>Showing {filteredReviews.length} of {reviews.length} entries</span>
          </div>
        </div>

        {/* Reviews/Complaints List */}
        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
          ) : filteredReviews.length > 0 ? (
            filteredReviews.map((review) => (
              <div key={review.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                {/* Header with user info and tags */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-gray-700 font-bold">
                      {review.user.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900">{review.user}</h3>
                        <span className="text-sm text-gray-500 flex items-center gap-1">
                          <Calendar size={12} />
                          {review.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {getReviewTypeTag(review.type)}
                        {getUserTypeTag(review.userType, review.fraudFlag)}
                        {review.orderCount && (
                          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                            {review.orderCount} orders
                          </span>
                        )}
                        {review.rating && (
                          <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                size={14} 
                                className={`${i < review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} 
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-sm text-gray-500">ID: #{review.id.toString().padStart(4, '0')}</div>
                  </div>
                </div>

                {/* Message */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <MessageSquare size={16} />
                    Customer Feedback
                  </div>
                  <p className="text-gray-800 pl-2 border-l-2 border-gray-300 py-1 px-4 bg-gray-50 rounded-r">
                    {review.message}
                  </p>
                </div>

                {/* Response Section */}
                {review.response ? (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                      <CheckCircle size={16} />
                      Store Response
                    </div>
                    <p className="text-green-900 pl-2">{review.response}</p>
                    <div className="text-right mt-2">
                      <span className="text-xs text-green-600">Responded</span>
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-gray-700 font-medium mb-3">
                      <Send size={16} />
                      Respond to Customer
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
                      <input
                        type="text"
                        className="border border-gray-300 rounded-lg px-4 py-3 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Type your professional response here..."
                        value={responseText[review.id] || ''}
                        onChange={(e) => handleResponseChange(review.id, e.target.value)}
                      />
                      <button
                        className={`px-5 py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${responseText[review.id] ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                        onClick={() => handleSendResponse(review.id)}
                        disabled={!responseText[review.id]}
                      >
                        <Send size={16} />
                        Send Response
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 mt-2 pl-1">
                      Tip: Be professional, empathetic, and offer solutions when appropriate.
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="text-gray-400" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No feedback found</h3>
              <p className="text-gray-500">There are no {filter === 'all' ? '' : filter} entries to display.</p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">User Type Legend</h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-sm text-gray-600">Repeated User - Multiple orders</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-600">New User - First few orders</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm text-gray-600">Fraud Risk - Suspicious activity detected</span>
            </div>
          </div>
        </div>
      </div>
    </MXLayoutWhite>
  );
};

export default UserInsightsPage;