"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useToast, ToastContainer } from '@/components/Toast';
import { 
  Briefcase, 
  TrendingUp, 
  DollarSign, 
  GraduationCap,
  Users,
  Heart,
  MapPin,
  Clock,
  ArrowRight,
  Filter,
  Star,
  User,
  Mail,
  Phone,
  Upload,
  ChevronDown,
  Globe,
  Building,
  Calendar,
  Link,
  FileText,
  X,
  CheckCircle,
  Eye,
  Check,
  AlertCircle,
  IndianRupee,
  Search,
  UserCheck,
  Sparkles,
  Target,
  Shield,
  Zap
} from 'lucide-react';

const Careers = () => {
  const { toasts, removeToast, success, error, info } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFAQ, setActiveFAQ] = useState(null);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [categories, setCategories] = useState(['All']);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    job_id: '',
    full_name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    experience_years: '',
    current_company: '',
    expected_salary: '',
    notice_period: '',
    portfolio_url: '',
    linkedin_url: '',
    github_url: '',
    resume_url: '',
    cover_letter: ''
  });
  const [jobListings, setJobListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [applicationCounts, setApplicationCounts] = useState({});

  // Fetch application counts with cache busting
  useEffect(() => {
    const fetchApplicationCounts = async () => {
      try {
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/job-applications/count?t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          }
        });
        if (response.ok) {
          const counts = await response.json();
          setApplicationCounts(counts);
        }
      } catch (error) {
        console.error('Error fetching application counts:', error);
      }
    };

    fetchApplicationCounts();
    const interval = setInterval(fetchApplicationCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch job listings from API
  useEffect(() => {
    const fetchJobListings = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/job-listings');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setJobListings(data);

        if (data.length > 0) {
          const uniqueCategories = ['All', ...new Set(data.map(job => job.category || 'Uncategorized'))];
          setCategories(uniqueCategories);
        }
        setLoadingError(null);
      } catch (error) {
        console.error('Error fetching job listings:', error);
        setLoadingError('Failed to load job listings. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchJobListings();
  }, []);

  // Show loader animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const benefits = [
    { icon: <Briefcase className="w-5 h-5" />, title: 'Flexible Work', description: 'Remote & hybrid options available', color: 'from-blue-500 to-blue-600' },
    { icon: <TrendingUp className="w-5 h-5" />, title: 'Career Growth', description: 'Clear promotion paths', color: 'from-emerald-500 to-emerald-600' },
    { icon: <IndianRupee className="w-5 h-5" />, title: 'Competitive Pay', description: 'Above industry standards', color: 'from-amber-500 to-amber-600' },
    { icon: <GraduationCap className="w-5 h-5" />, title: 'Learning Budget', description: 'Annual training budget', color: 'from-violet-500 to-violet-600' },
    { icon: <Users className="w-5 h-5" />, title: 'Team Culture', description: 'Collaborative environment', color: 'from-rose-500 to-rose-600' },
    { icon: <Heart className="w-5 h-5" />, title: 'Health Benefits', description: 'Comprehensive medical plans', color: 'from-cyan-500 to-cyan-600' },
  ];

  const values = [
    { icon: <Target className="w-5 h-5" />, title: 'Mission Driven', description: 'We solve real-world delivery challenges' },
    { icon: <Zap className="w-5 h-5" />, title: 'Fast Paced', description: 'Rapid growth and innovation' },
    { icon: <Users className="w-5 h-5" />, title: 'Inclusive', description: 'Diverse perspectives welcome' },
    { icon: <Shield className="w-5 h-5" />, title: 'Reliable', description: 'Consistent and trustworthy service' },
  ];

  const processSteps = [
    { step: 1, title: 'Application Review', description: 'Resume screening within 48 hours', duration: '1-2 days' },
    { step: 2, title: 'Initial Call', description: '30-minute cultural fit discussion', duration: '30 mins' },
    { step: 3, title: 'Technical Interview', description: 'Skills assessment (role-specific)', duration: '1-2 hours' },
    { step: 4, title: 'Team Interview', description: 'Meet your potential colleagues', duration: '1 hour' },
    { step: 5, title: 'Offer & Onboarding', description: 'Welcome to the team!', duration: '1 week' },
  ];

  const faqs = [
    {
      question: 'How long does the hiring process take?',
      answer: 'Typically 2-3 weeks from application to offer. We aim to move quickly while ensuring thorough evaluation.'
    },
    {
      question: 'Do you offer remote positions?',
      answer: 'Yes! Many of our roles are fully remote. Location requirements are specified in each job listing.'
    },
    {
      question: 'What benefits do you offer?',
      answer: 'Comprehensive package including health insurance, PF matching, flexible PTO, learning budget, and more.'
    },
    {
      question: 'Can I apply for multiple positions?',
      answer: 'Yes, you can apply for multiple roles that match your skills and interests.'
    },
    {
      question: 'Do you hire junior/entry-level positions?',
      answer: 'Yes, we regularly hire for entry-level positions. Look for roles marked with "Junior" or "Entry Level".'
    },
  ];

  const filteredJobs = (filter === 'All' 
    ? jobListings 
    : jobListings.filter(job => job.category === filter))
    .filter(job => {
      const searchLower = searchQuery.toLowerCase();
      return (
        (job.role || '').toLowerCase().includes(searchLower) ||
        (job.description || '').toLowerCase().includes(searchLower) ||
        (job.category || '').toLowerCase().includes(searchLower)
      );
    });

  const toggleFAQ = (index) => {
    setActiveFAQ(activeFAQ === index ? null : index);
  };

  const handleApplyClick = (job) => {
    setSelectedJob(job);
    setFormData(prev => ({
      ...prev,
      job_id: job.id
    }));
    setCurrentStep(1);
    setShowApplicationModal(true);
  };

  const handleViewDetailsClick = (job) => {
    setSelectedJob(job);
    setShowJobDetailsModal(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSalaryChange = (e) => {
    let value = e.target.value;
    value = value.replace(/[^\d,]/g, '');
    
    const parts = value.split(',');
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.length > 2) {
        value = parts.slice(0, -1).join(',') + ',' + lastPart.slice(0, 2);
      }
    }
    
    setFormData(prev => ({
      ...prev,
      expected_salary: value
    }));
  };

  const formatSalary = (salary) => {
    if (!salary) return '';
    const numericValue = salary.replace('₹', '').replace(' per year', '').trim();
    return `₹${numericValue} per year`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
      return;
    }

    if (!resumeFile) {
      error('Please upload your resume before submitting');
      return;
    }

    try {
      setIsSubmitting(true);

      const formDataToUpload = new FormData();
      formDataToUpload.append('file', resumeFile);

      const uploadResponse = await fetch('/api/upload-resume', {
        method: 'POST',
        body: formDataToUpload,
      });

      if (!uploadResponse.ok) {
        const uploadError = await uploadResponse.json();
        throw new Error(uploadError.error || 'Failed to upload resume');
      }

      const uploadData = await uploadResponse.json();
      const signedUrl = uploadData.signedUrl;

      const submissionData = {
        ...formData,
        expected_salary: formatSalary(formData.expected_salary),
        resume_url: signedUrl
      };

      const response = await fetch('/api/job-applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        throw new Error('Failed to submit application');
      }

      const result = await response.json();

      setFormData({
        job_id: selectedJob?.id || '',
        full_name: '',
        email: '',
        phone: '',
        city: '',
        state: '',
        experience_years: '',
        current_company: '',
        expected_salary: '',
        notice_period: '',
        portfolio_url: '',
        linkedin_url: '',
        github_url: '',
        resume_url: '',
        cover_letter: ''
      });
      setResumeFile(null);
      setResumeFileName('');
      setCurrentStep(1);
      setShowApplicationModal(false);
      
      success(result.message);
      
    } catch (err) {
      console.error('Error submitting application:', err);
      error(err.message || 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const steps = [
    { number: 1, title: 'Basic Info' },
    { number: 2, title: 'Professional Details' },
    { number: 3, title: 'Review & Submit' }
  ];

  // Close modals when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const modals = document.querySelectorAll('.modal-content');
      let clickedInsideModal = false;
      
      modals.forEach(modal => {
        if (modal.contains(event.target)) {
          clickedInsideModal = true;
        }
      });

      if (!clickedInsideModal) {
        setShowApplicationModal(false);
        setShowJobDetailsModal(false);
      }
    };

    if (showApplicationModal || showJobDetailsModal) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [showApplicationModal, showJobDetailsModal]);

  if (loadingError) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Jobs</h3>
            <p className="text-gray-600 mb-4">{loadingError}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Retry
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Page Loader */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 bg-gradient-to-br from-slate-950 to-black flex items-center justify-center z-50"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 p-1"
          >
            <div className="w-full h-full rounded-full bg-slate-950" />
          </motion.div>
        </motion.div>
      )}

      <div className="sticky top-0 z-50">
        <Navbar />
      </div>

      {/* Mobile-only: Sticky "We're Hiring" bar below navbar */}
      <div className="md:hidden sticky top-16 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="container mx-auto w-[90%] py-3 flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span>We're Hiring Exciting Roles</span>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 py-16 md:py-24">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]" />
        <div className="container mx-auto w-[90%] relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mb-6">
              <Sparkles className="w-4 h-4" />
              <span>We're Hiring Exciting Roles</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              Build the Future of
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600"> Local Deliveries</span>
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
              Join our mission to revolutionize last-mile delivery with cutting-edge technology 
              and a team that values innovation, reliability, and community impact.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="#positions" 
                className="inline-flex items-center justify-center bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-8 py-3.5 rounded-lg font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg hover:shadow-xl"
              >
                View Open Positions
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
              <a 
                href="#why-join" 
                className="inline-flex items-center justify-center border-2 border-gray-300 text-gray-700 px-8 py-3.5 rounded-lg font-semibold hover:border-blue-600 hover:text-blue-600 transition-all duration-300"
              >
                Learn About Us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="bg-white border-y border-gray-100 py-8">
        <div className="container mx-auto w-[90%]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {[
              { value: '50+', label: 'Team Members', icon: <Users className="w-5 h-5" /> },
              { value: '10K+', label: 'Daily Deliveries', icon: <Zap className="w-5 h-5" /> },
              { value: '95%', label: 'Customer Satisfaction', icon: <Heart className="w-5 h-5" /> },
              { value: '15+', label: 'Cities Served', icon: <MapPin className="w-5 h-5" /> },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-600 mb-3">
                  {stat.icon}
                </div>
                <div className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
                <div className="text-gray-600 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why Join Us */}
      <section id="why-join" className="py-16 md:py-24 bg-gradient-to-b from-white to-slate-50">
        <div className="container mx-auto w-[90%]">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Why Join GatiMitra?</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              We're building more than a delivery platform—we're creating opportunities and 
              transforming communities through innovation and collaboration.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {benefits.map((benefit, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="group bg-white rounded-2xl p-6 border border-gray-200 hover:border-blue-300 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${benefit.color} text-white mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Company Values */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl p-8 md:p-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Our Values</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((value, index) => (
                <div key={index} className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white text-blue-600 mb-4 shadow-sm">
                    {value.icon}
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">{value.title}</h4>
                  <p className="text-gray-600 text-sm">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section id="positions" className="py-16 md:py-24 bg-white">
        <div className="container mx-auto w-[90%]">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Open Positions</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Find your perfect role and join our growing team of innovators and problem-solvers
            </p>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 font-medium">Filter by:</span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {(showAllFilters ? categories : categories.slice(0, 5)).map(category => (
                  <button
                    key={category}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      filter === category 
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md' 
                        : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-600 hover:text-blue-600'
                    }`}
                    onClick={() => setFilter(category)}
                  >
                    {category}
                  </button>
                ))}
                {categories.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllFilters(!showAllFilters)}
                    className="px-4 py-2 rounded-lg font-medium border border-gray-300 bg-white text-gray-700 hover:border-blue-600 hover:text-blue-600 transition-all"
                  >
                    {showAllFilters ? 'Show less' : `View All (${categories.length})`}
                  </button>
                )}
              </div>
            </div>

            <div className="relative w-full lg:w-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search jobs by title, keyword, or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full lg:w-80 pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 text-gray-900"
                />
              </div>
            </div>
          </div>

          {/* Job Listings */}
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
              <p className="text-gray-600">Loading available positions...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {filteredJobs.length > 0 ? (
                  filteredJobs.map(job => (
                    <div 
                      key={job.id}
                      className="group bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow transition-all duration-200 max-w-sm mx-auto"
                    >
                      <div className="flex flex-col h-full">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h3 className="text-base font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                                {job.role || 'Position'}
                              </h3>
                              <div className="flex flex-wrap gap-1 mb-2">
                                <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                                  <MapPin className="w-4 h-4 mr-1" />
                                  {job.location || 'Remote'}
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {job.experience || 'Exp n/a'}
                                </span>
                              </div>
                            </div>
                            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                              {job.category || 'General'}
                            </span>
                          </div>
                          
                          <div className="mb-2">
                            <div className="flex items-center text-green-700 font-semibold mb-1">
                              <IndianRupee className="w-4 h-4 mr-1" />
                              {job.salary || 'Salary n/a'}
                            </div>
                            <p className="text-gray-600 line-clamp-3 mb-2 text-xs">
                              {job.description || 'No description available'}
                            </p>
                          </div>

                          {(applicationCounts[job.id] || 0) > 0 && (
                            <div className="mt-auto p-1 bg-blue-50 rounded flex items-center">
                              <UserCheck className="w-4 h-4 text-blue-600 mr-1" />
                              <span className="text-xs font-medium text-blue-700">
                                {applicationCounts[job.id]} {applicationCounts[job.id] === 1 ? 'application' : 'applications'}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2 pt-2 mt-2 border-t border-gray-100">
                          <button 
                            onClick={() => handleApplyClick(job)}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-2 px-2 rounded font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all flex items-center justify-center group text-xs"
                          >
                            Apply
                            <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                          </button>
                          <button 
                            onClick={() => handleViewDetailsClick(job)}
                            className="flex-1 border border-gray-300 text-gray-700 py-2 px-2 rounded font-semibold hover:border-blue-600 hover:text-blue-600 transition-all flex items-center justify-center text-xs"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-16">
                    <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-6">
                      <Briefcase className="w-10 h-10 text-gray-400" />
                    </div>
                    <h3 className="text-2xl font-semibold text-gray-900 mb-3">No positions matching your criteria</h3>
                    <p className="text-gray-600 max-w-md mx-auto mb-6">
                      Try adjusting your filters or search terms, or check back soon for new opportunities.
                    </p>
                    <button 
                      onClick={() => {
                        setFilter('All');
                        setSearchQuery('');
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Reset Filters
                    </button>
                  </div>
                )}
              </div>
              
              {filteredJobs.length > 0 && (
                <div className="text-center mt-12 pt-8 border-t border-gray-200">
                  <p className="text-gray-600">
                    Showing <span className="font-semibold text-gray-900">{filteredJobs.length}</span> of{' '}
                    <span className="font-semibold text-gray-900">{jobListings.length}</span> positions
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Hiring Process */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto w-[90%]">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our Hiring Process</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              Transparent and efficient—we respect your time and value clear communication throughout the journey.
            </p>
          </div>
          
          <div className="relative">
            <div className="hidden lg:block absolute left-0 right-0 top-1/2 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 -translate-y-1/2" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {processSteps.map((step) => (
                <div key={step.step} className="relative">
                  <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 h-full">
                    <div className="flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-full flex items-center justify-center font-bold text-lg mb-4 relative z-10">
                        {step.step}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                      <p className="text-gray-600 text-sm mb-3">{step.description}</p>
                      <div className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        {step.duration}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto w-[90%]">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Get answers to common questions about working at GatiMitra
            </p>
          </div>
          
          <div className="max-w-3xl mx-auto">
            {faqs.map((faq, index) => (
              <div 
                key={index}
                className="mb-4 last:mb-0"
              >
                <button
                  className="w-full text-left p-6 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all duration-300 flex justify-between items-center group"
                  onClick={() => toggleFAQ(index)}
                >
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600">
                      {faq.question}
                    </h3>
                    {activeFAQ === index && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                        className="text-gray-600 overflow-hidden"
                      >
                        {faq.answer}
                      </motion.p>
                    )}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${activeFAQ === index ? 'transform rotate-180' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-16 md:py-24 bg-gradient-to-r from-blue-600 via-blue-700 to-cyan-700">
        <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]" />
        <div className="container mx-auto w-[90%] relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-full text-sm font-semibold mb-6">
              <Sparkles className="w-4 h-4" />
              <span>Ready to Make an Impact?</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Join Our Mission to Transform Local Deliveries
            </h2>
            <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
              Be part of a team that's reshaping local deliveries across communities with innovation, 
              technology, and a people-first approach.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="#positions" 
                className="inline-flex items-center justify-center bg-white text-blue-600 px-8 py-3.5 rounded-lg font-semibold hover:bg-gray-100 transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg hover:shadow-xl"
              >
                Browse All Positions
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
              <button className="inline-flex items-center justify-center border-2 border-white text-white px-8 py-3.5 rounded-lg font-semibold hover:bg-white/10 transition-all duration-300">
                Contact Our Team
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Application Modal */}
      {showApplicationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="modal-content bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Apply Now</h2>
                <p className="text-gray-600 mt-1">
                  Position: <span className="font-semibold text-blue-600">{selectedJob?.role || 'Selected Position'}</span>
                </p>
              </div>
              <button 
                onClick={() => setShowApplicationModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="px-6 pt-6">
              <div className="flex justify-between mb-8">
                {steps.map((step) => (
                  <React.Fragment key={step.number}>
                    <div className="flex flex-col items-center flex-1">
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
                        ${currentStep >= step.number 
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md' 
                          : 'bg-gray-100 text-gray-500'
                        } transition-all duration-300
                      `}>
                        {currentStep > step.number ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          step.number
                        )}
                      </div>
                      <span className="text-xs mt-2 font-medium text-gray-700">{step.title}</span>
                    </div>
                    {step.number < steps.length && (
                      <div className="flex-1 flex items-center px-2">
                        <div className={`h-1 w-full ${currentStep > step.number ? 'bg-gradient-to-r from-blue-600 to-cyan-600' : 'bg-gray-200'}`}></div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 pb-6">
              {currentStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Basic Information</h3>
                  
                  <div>
                    <label className="block text-gray-700 font-medium mb-3 flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Full Name *
                    </label>
                    <input 
                      type="text" 
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <Mail className="w-4 h-4 mr-2" />
                        Email Address *
                      </label>
                      <input 
                        type="email" 
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="Enter your email address"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <Phone className="w-4 h-4 mr-2" />
                        Phone Number *
                      </label>
                      <input 
                        type="tel" 
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="Enter your phone number"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <MapPin className="w-4 h-4 mr-2" />
                        City
                      </label>
                      <input 
                        type="text" 
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="Enter your city"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <MapPin className="w-4 h-4 mr-2" />
                        State
                      </label>
                      <input 
                        type="text" 
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="Enter your state"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Professional Details</h3>
                  
                  <div>
                    <label className="block text-gray-700 font-medium mb-3 flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      Years of Experience *
                    </label>
                    <select 
                      name="experience_years"
                      value={formData.experience_years}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      required
                    >
                      <option value="" className="text-gray-500">Select experience level</option>
                      <option value="0-1">0-1 years</option>
                      <option value="1-3">1-3 years</option>
                      <option value="3-5">3-5 years</option>
                      <option value="5-8">5-8 years</option>
                      <option value="8+">8+ years</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-medium mb-3 flex items-center">
                      <Building className="w-4 h-4 mr-2" />
                      Current Company
                    </label>
                    <input 
                      type="text" 
                      name="current_company"
                      value={formData.current_company}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                      placeholder="Enter your current company"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-700 font-medium mb-3">
                      Expected Annual Salary *
                    </label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-900 font-medium">
                        ₹
                      </div>
                      <input 
                        type="text" 
                        name="expected_salary"
                        value={formData.expected_salary}
                        onChange={handleSalaryChange}
                        className="w-full border border-gray-300 rounded-xl pl-10 pr-24 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="1,00,000"
                        required
                      />
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-900 text-sm">
                        per year
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-2">Enter amount in INR (e.g., 1,00,000 for 1 lakh)</p>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-medium mb-3 flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      Notice Period *
                    </label>
                    <select 
                      name="notice_period"
                      value={formData.notice_period}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      required
                    >
                      <option value="" className="text-gray-500">Select notice period</option>
                      <option value="Immediate">Immediate</option>
                      <option value="15 days">15 days</option>
                      <option value="30 days">30 days</option>
                      <option value="60 days">60 days</option>
                      <option value="90 days">90 days</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <Link className="w-4 h-4 mr-2" />
                        Portfolio URL
                      </label>
                      <input 
                        type="url" 
                        name="portfolio_url"
                        value={formData.portfolio_url}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="https://yourportfolio.com"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <Briefcase className="w-4 h-4 mr-2" />
                        LinkedIn Profile
                      </label>
                      <input 
                        type="url" 
                        name="linkedin_url"
                        value={formData.linkedin_url}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="https://linkedin.com/in/yourprofile"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <Globe className="w-4 h-4 mr-2" />
                        GitHub Profile
                      </label>
                      <input 
                        type="url" 
                        name="github_url"
                        value={formData.github_url}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                        placeholder="https://github.com/yourprofile"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Review & Submit</h3>
                  
                  <div className="bg-gray-50 rounded-2xl p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Full Name</p>
                          <p className="font-semibold text-gray-900">{formData.full_name || 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Email</p>
                          <p className="font-semibold text-gray-900">{formData.email || 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Phone</p>
                          <p className="font-semibold text-gray-900">{formData.phone || 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Location</p>
                          <p className="font-semibold text-gray-900">
                            {formData.city && formData.state 
                              ? `${formData.city}, ${formData.state}` 
                              : formData.city || formData.state || 'Not provided'
                            }
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Experience</p>
                          <p className="font-semibold text-gray-900">{formData.experience_years || 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Current Company</p>
                          <p className="font-semibold text-gray-900">{formData.current_company || 'Not provided'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Expected Salary</p>
                          <p className="font-semibold text-gray-900">
                            {formData.expected_salary ? `₹${formData.expected_salary} per year` : 'Not provided'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Notice Period</p>
                          <p className="font-semibold text-gray-900">{formData.notice_period || 'Not provided'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-200">
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <Upload className="w-4 h-4 mr-2" />
                        Resume/CV *
                      </label>
                      <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input 
                          ref={fileInputRef}
                          type="file" 
                          name="resume_file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                              const maxSize = 5 * 1024 * 1024;
                              
                              if (!allowedMimes.includes(file.type)) {
                                error('Only PDF and DOC files are allowed');
                                setResumeFile(null);
                                setResumeFileName('');
                                e.target.value = '';
                                return;
                              }
                              
                              if (file.size > maxSize) {
                                error('File size must be less than 5MB');
                                setResumeFile(null);
                                setResumeFileName('');
                                e.target.value = '';
                                return;
                              }
                              
                              setResumeFile(file);
                              setResumeFileName(file.name);
                              info(`Resume "${file.name}" selected`);
                            }
                          }}
                          className="hidden"
                          required
                        />
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-700 font-medium mb-1">
                          {resumeFileName || 'Click to upload your resume'}
                        </p>
                        <p className="text-sm text-gray-500">
                          PDF or DOC format, max 5MB
                        </p>
                      </div>
                      {resumeFileName && (
                        <div className="mt-3 p-3 bg-green-50 rounded-lg flex items-center">
                          <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                          <span className="text-green-700 font-medium">{resumeFileName}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-3 flex items-center">
                        <FileText className="w-4 h-4 mr-2" />
                        Cover Letter / Why GatiMitra?
                      </label>
                      <textarea 
                        name="cover_letter"
                        value={formData.cover_letter}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-2xl px-4 py-3.5 h-40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 resize-none"
                        placeholder="Tell us why you're excited to join our team and what you can contribute..."
                      ></textarea>
                    </div>
                  </div>

                  <div className="flex items-start p-4 bg-blue-50 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-700">
                      By submitting, you confirm that all information provided is accurate and complete. 
                      We'll review your application and contact you within 3-5 business days.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-between mt-8 pt-8 border-t border-gray-200">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="px-8 py-3.5 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:border-blue-600 hover:text-blue-600 transition-all duration-300"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowApplicationModal(false)}
                    className="px-8 py-3.5 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:border-blue-600 hover:text-blue-600 transition-all duration-300"
                  >
                    Cancel
                  </button>
                )}
                
                <button
                  type={currentStep === 3 ? 'submit' : 'button'}
                  onClick={currentStep < 3 ? nextStep : undefined}
                  disabled={isSubmitting}
                  className={`px-8 py-3.5 rounded-xl font-semibold flex items-center transition-all duration-300 ${
                    isSubmitting 
                      ? 'bg-gray-400 text-white cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 shadow-lg hover:shadow-xl'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin w-5 h-5 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                      Submitting...
                    </>
                  ) : (
                    <>
                      {currentStep === 3 ? 'Submit Application' : 'Continue'}
                      {currentStep < 3 && <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />}
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Job Details Modal */}
      {showJobDetailsModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="modal-content bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedJob.role || 'Position Details'}</h2>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                    <MapPin className="w-4 h-4 mr-1.5" />
                    {selectedJob.location || 'Remote'}
                  </span>
                  <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    <Clock className="w-4 h-4 mr-1.5" />
                    {selectedJob.experience || 'Exp n/a'}
                  </span>
                  <span className="inline-flex items-center px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                    <IndianRupee className="w-4 h-4 mr-1.5" />
                    {selectedJob.salary || 'Salary n/a'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowJobDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-4"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Job Description</h3>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-600 leading-relaxed">{selectedJob.description || 'No description available'}</p>
                </div>
              </div>
              {selectedJob.requirements && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h3>
                  <ul className="space-y-2">
                    {selectedJob.requirements.split(',').map((req, index) => (
                      <li key={index} className="flex items-start">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mr-3 mt-0.5">
                          <Check className="w-3 h-3 text-green-600" />
                        </div>
                        <span className="text-gray-600">{req.trim()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedJob.responsibilities && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Responsibilities</h3>
                  <ul className="space-y-2">
                    {selectedJob.responsibilities.split(',').map((resp, index) => (
                      <li key={index} className="flex items-start">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center mr-3 mt-0.5">
                          <Check className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-gray-600">{resp.trim()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="pt-6 border-t border-gray-200">
                <button 
                  onClick={() => {
                    setShowJobDetailsModal(false);
                    handleApplyClick(selectedJob);
                  }}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-3.5 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center group"
                >
                  Apply for this Position
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Careers;