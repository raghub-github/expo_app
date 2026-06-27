"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
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
  UserCheck
} from 'lucide-react';

const Careers = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFAQ, setActiveFAQ] = useState(null);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showJobDetailsModal, setShowJobDetailsModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [categories, setCategories] = useState(['All']);
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
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [jobListings, setJobListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [applicationCounts, setApplicationCounts] = useState({});

  // Fetch application counts with cache busting and improved polling
  useEffect(() => {
    const fetchApplicationCounts = async () => {
      try {
        // Generate unique cache buster
        const cacheBuster = `cb=${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const response = await fetch(`/api/job-applications/count?${cacheBuster}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Pragma': 'no-cache',
          },
          next: { revalidate: 0 }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        // Accept both { jobId: count, ... } and { success, counts } formats
        if (result.success && result.counts) {
          setApplicationCounts(result.counts);
          console.log(`[${new Date().toLocaleTimeString()}] Counts updated:`, result.counts);
        } else if (typeof result === 'object' && result !== null) {
          setApplicationCounts(result);
          console.log(`[${new Date().toLocaleTimeString()}] Counts updated:`, result);
        }
      } catch (error) {
        console.error('Error fetching application counts:', error);
        // Optional: Implement retry logic
      }
    };

    // Fetch immediately on mount
    fetchApplicationCounts();

    // Set up polling every 15 seconds
    const intervalId = setInterval(fetchApplicationCounts, 15000);

    // Also fetch when page becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchApplicationCounts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
    { icon: <Briefcase className="w-6 h-6" />, title: 'Flexible Work', description: 'Remote & hybrid options available' },
    { icon: <TrendingUp className="w-6 h-6" />, title: 'Career Growth', description: 'Clear promotion paths' },
    { icon: <IndianRupee className="w-6 h-6" />, title: 'Competitive Pay', description: 'Above industry standards' },
    { icon: <GraduationCap className="w-6 h-6" />, title: 'Learning Budget', description: 'Annual training budget' },
    { icon: <Users className="w-6 h-6" />, title: 'Team Culture', description: 'Collaborative environment' },
    { icon: <Heart className="w-6 h-6" />, title: 'Health Benefits', description: 'Comprehensive medical plans' },
  ];

  const processSteps = [
    { step: 1, title: 'Application Review', description: 'Resume screening within 48 hours' },
    { step: 2, title: 'Initial Call', description: '30-minute cultural fit discussion' },
    { step: 3, title: 'Technical Interview', description: 'Skills assessment (role-specific)' },
    { step: 4, title: 'Team Interview', description: 'Meet your potential colleagues' },
    { step: 5, title: 'Offer & Onboarding', description: 'Welcome to the team!' },
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
    setFormData(prev => ({ ...prev, job_id: job.id }));
    setShowApplicationModal(true);
    setCurrentStep(1);
  };

  const handleViewDetailsClick = (job) => {
    setSelectedJob(job);
    setShowJobDetailsModal(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSalaryChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    const formattedValue = value ? parseInt(value).toLocaleString('en-IN') : '';
    setFormData(prev => ({ ...prev, expected_salary: formattedValue }));
  };

  const formatSalary = (salary) => {
    if (!salary) return '0';
    const numericValue = parseInt(salary.replace(/,/g, ''));
    return isNaN(numericValue) ? '0' : numericValue.toString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitMessage('');
    setSubmitError('');
    try {
      if (!resumeFile) {
        setSubmitError('Please upload your resume before submitting');
        return;
      }

      setIsSubmitting(true);

      // Upload resume to R2
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

      // Submit application with signed URL
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit application');
      }

      const result = await response.json();

      // Reset form after successful submission
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
      setSubmitMessage(result.message || 'Application submitted successfully!');
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit application. Please try again.');
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
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500 text-center">
            <p className="text-xl font-semibold">{loadingError}</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">


      <Header />
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mb-6">
              <Star className="w-4 h-4 mr-2" />
              <span>We're Hiring</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Shape the Future of <span className="text-blue-600">Local Logistics</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              At <b>GatiMitra</b>, we're on a mission to make deliveries faster, smarter, and more reliable for everyone. Join a passionate team that's transforming how India moves, one parcel at a time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="#positions" className="inline-flex items-center justify-center bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                View Open Roles
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
              <button
                className="inline-flex items-center justify-center border-2 border-gray-300 text-gray-700 px-8 py-3 rounded-lg font-semibold hover:border-blue-600 hover:text-blue-600 transition-colors"
                onClick={() => {
                  const section = document.getElementById('why-work-with-us');
                  if (section) {
                    section.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                Learn More
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="bg-gray-50 border-y py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: '50+', label: 'Team Members' },
              { value: '10K+', label: 'Deliveries Daily' },
              { value: '95%', label: 'Customer Satisfaction' },
              { value: '15+', label: 'Cities Served' },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-gray-600 text-sm md:text-base">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why Join Us */}
      <section id="why-work-with-us" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 40 }} 
            whileInView={{ opacity: 1, y: 0 }} 
            viewport={{ once: true }} 
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Why Work With Us?</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              We're not just building a delivery platform—we're building careers, empowering communities, and creating real impact. Grow with us and help redefine the future of logistics in India.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                className="group bg-white border border-gray-200 rounded-xl p-6 hover:border-blue-600 hover:shadow-lg transition-all duration-300"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  {benefit.icon}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section id="positions" className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Current Openings</h2>
            <p className="text-gray-600">Explore exciting opportunities and become a part of our fast-growing team.</p>
          </motion.div>

          {/* Filters and Search */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            {/* Filters - Left Side */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 font-medium">Filter by:</span>
              </div>
              {categories.map(category => (
                <button
                  key={category}
                  className={`px-5 py-2.5 rounded-full font-medium transition-all ${
                    filter === category 
                      ? 'bg-blue-600 text-white shadow-md' 
                      : 'bg-white text-gray-700 border hover:border-blue-600 hover:text-blue-600'
                  }`}
                  onClick={() => setFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Search Bar - Right Side */}
            <div className="flex items-center bg-white border border-gray-300 rounded-lg px-4 py-2.5 w-full md:w-64 hover:border-blue-600 transition-colors">
              <Search className="w-5 h-5 text-gray-500 mr-2" />
              <input
                type="text"
                placeholder="Search by job title or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-gray-700 placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Job Listings */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-12 h-12 mx-auto border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
              <p className="text-gray-600">Loading job listings...</p>
            </div>
          ) : loadingError ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Error loading jobs</h3>
              <p className="text-gray-600">{loadingError}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredJobs.length > 0 ? (
                  filteredJobs.map((job, idx) => (
                    <motion.div
                      key={job.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-600 hover:shadow-lg transition-all duration-300"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: idx * 0.08 }}
                    >
                      <div className="flex flex-col h-full">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-gray-900 mb-1.5">{job.role || 'Position'}</h3>
                              <div className="flex flex-wrap gap-2 mb-2">
                                <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                                  <MapPin className="w-3 h-3 mr-1" />
                                  {job.location || 'Remote'}
                                </span>
                                <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {job.experience || 'Experience not specified'}
                                </span>
                              </div>
                            </div>
                            <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                              {job.category || 'General'}
                            </span>
                          </div>
                          <div className="mb-3">
                            <div className="flex items-center text-green-700 font-semibold mb-1.5">
                              {job.salary || 'Salary not specified'}
                            </div>
                            <p className="text-gray-600 text-sm line-clamp-3">{job.description || 'No description available'}</p>
                          </div>
                          {/* Application Count - Only show if > 0 */}
                          {applicationCounts[job.id] > 0 && (
                            <div className="mt-2 p-2 bg-blue-50 rounded-lg flex items-center">
                              <UserCheck className="w-3 h-3 text-blue-600 mr-2" />
                              <span className="text-xs font-medium text-blue-700">
                                {applicationCounts[job.id]} {applicationCounts[job.id] === 1 ? 'application' : 'applications'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-3 pt-2 mt-3 border-t border-gray-100">
                          <button 
                            onClick={() => handleApplyClick(job)}
                            className="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center text-sm"
                          >
                            Apply Now
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </button>
                          <button 
                            onClick={() => handleViewDetailsClick(job)}
                            className="flex-1 border border-gray-300 text-gray-700 py-2.5 px-4 rounded-lg font-medium hover:border-blue-600 hover:text-blue-600 transition-colors text-sm flex items-center justify-center"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Details
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <Briefcase className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No open positions at the moment</h3>
                    <p className="text-gray-600">Check back later for new opportunities</p>
                  </div>
                )}
              </motion.div>
              
              {filteredJobs.length > 0 && (
                <div className="text-center mt-8">
                  <p className="text-gray-600">
                    Showing {filteredJobs.length} of {jobListings.length} positions
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Hiring Process */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">How We Hire</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              We believe in a transparent, respectful, and efficient hiring process. Our team values your time and strives for clear, honest communication at every step.
            </p>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="hidden md:block absolute left-1/2 transform -translate-x-1/2 h-0.5 w-4/5 bg-gray-200 top-1/2"></div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-4">
              {processSteps.map((step) => (
                <div 
                  key={step.step}
                  className="relative"
                >
                  <div className="bg-white border border-gray-200 rounded-xl p-6 text-center hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">
                      {step.step}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-sm text-gray-600">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-gray-600">Get answers to common questions about working at GatiMitra</p>
          </div>

          <div className="max-w-3xl mx-auto">
            {faqs.map((faq, index) => (
              <div 
                key={index}
                className="mb-4 border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                  onClick={() => toggleFAQ(index)}
                >
                  <span className="font-semibold text-gray-900">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${activeFAQ === index ? 'transform rotate-180' : ''}`} />
                </button>
                {activeFAQ === index && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center text-white">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Make an Impact?</h2>
            <p className="text-lg mb-8 text-blue-100">
              Join GatiMitra and help us deliver smiles, speed, and reliability to millions. Your journey starts here.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="#positions" 
                className="inline-flex items-center justify-center bg-white text-blue-600 px-8 py-3.5 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Browse All Positions
                <ArrowRight className="w-5 h-5 ml-2" />
              </a>
              <button className="inline-flex items-center justify-center border-2 border-white text-white px-8 py-3.5 rounded-lg font-semibold hover:bg-white/10 transition-colors">
                Contact HR Team
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Application Modal */}
      {showApplicationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="modal-content bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Apply Now</h2>
                <p className="text-gray-600 text-sm mt-1">Position: {selectedJob?.role || 'Selected Position'}</p>
              </div>
              <button 
                onClick={() => setShowApplicationModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="px-6 pt-6">
              <div className="flex justify-between mb-8">
                {steps.map((step) => (
                  <div key={step.number} className="flex flex-col items-center">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm
                      ${currentStep >= step.number 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-200 text-gray-500'
                      }
                    `}>
                      {currentStep > step.number ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        step.number
                      )}
                    </div>
                    <span className="text-xs mt-2 font-medium">{step.title}</span>
                    {step.number < steps.length && (
                      <div className={`h-1 w-16 mt-4 ${currentStep > step.number ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              {submitMessage && (
                <div className="mb-4 p-3 rounded bg-green-100 text-green-800 text-center font-medium">
                  {submitMessage}
                </div>
              )}
              {submitError && (
                <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-center font-medium">
                  {submitError}
                </div>
              )}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Basic Information</h3>
                  
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      <User className="inline w-4 h-4 mr-1" />
                      Full Name *
                    </label>
                    <input 
                      type="text" 
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <Mail className="inline w-4 h-4 mr-1" />
                        Email Address *
                      </label>
                      <input 
                        type="email" 
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter your email address"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <Phone className="inline w-4 h-4 mr-1" />
                        Phone Number *
                      </label>
                      <input 
                        type="tel" 
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter your phone number"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <MapPin className="inline w-4 h-4 mr-1" />
                        City
                      </label>
                      <input 
                        type="text" 
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter your city"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <MapPin className="inline w-4 h-4 mr-1" />
                        State
                      </label>
                      <input 
                        type="text" 
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter your state"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Professional Details</h3>
                  
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      <Clock className="inline w-4 h-4 mr-1" />
                      Years of Experience *
                    </label>
                    <select 
                      name="experience_years"
                      value={formData.experience_years}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      required
                    >
                      <option value="" className="text-gray-500">Select experience</option>
                      <option value="0-1" className="text-gray-900">0-1 years</option>
                      <option value="1-3" className="text-gray-900">1-3 years</option>
                      <option value="3-5" className="text-gray-900">3-5 years</option>
                      <option value="5-8" className="text-gray-900">5-8 years</option>
                      <option value="8+" className="text-gray-900">8+ years</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      <Building className="inline w-4 h-4 mr-1" />
                      Current Company
                    </label>
                    <input 
                      type="text" 
                      name="current_company"
                      value={formData.current_company}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      placeholder="Enter your current company"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      Expected Salary (per year) *
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-900">
                        ₹
                      </div>
                      <input 
                        type="text" 
                        name="expected_salary"
                        value={formData.expected_salary}
                        onChange={handleSalaryChange}
                        className="w-full border border-gray-300 rounded-lg pl-8 pr-20 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter amount (e.g., 1,00,000)"
                        required
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-900 text-sm">
                        per year
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Enter amount in INR (e.g., 1,00,000 for 1 lakhs)</p>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      <Calendar className="inline w-4 h-4 mr-1" />
                      Notice Period *
                    </label>
                    <select 
                      name="notice_period"
                      value={formData.notice_period}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      required
                    >
                      <option value="" className="text-gray-500">Select notice period</option>
                      <option value="Immediate" className="text-gray-900">Immediate</option>
                      <option value="15 days" className="text-gray-900">15 days</option>
                      <option value="30 days" className="text-gray-900">30 days</option>
                      <option value="60 days" className="text-gray-900">60 days</option>
                      <option value="90 days" className="text-gray-900">90 days</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <Link className="inline w-4 h-4 mr-1" />
                        Portfolio URL
                      </label>
                      <input 
                        type="url" 
                        name="portfolio_url"
                        value={formData.portfolio_url}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter your portfolio URL"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <Briefcase className="inline w-4 h-4 mr-1" />
                        LinkedIn Profile
                      </label>
                      <input 
                        type="url" 
                        name="linkedin_url"
                        value={formData.linkedin_url}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter your LinkedIn profile URL"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <Globe className="inline w-4 h-4 mr-1" />
                        GitHub Profile
                      </label>
                      <input 
                        type="url" 
                        name="github_url"
                        value={formData.github_url}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Enter your GitHub profile URL"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Review & Submit</h3>
                  
                  <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Full Name</p>
                        <p className="font-medium text-gray-900">{formData.full_name || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Email</p>
                        <p className="font-medium text-gray-900">{formData.email || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Phone</p>
                        <p className="font-medium text-gray-900">{formData.phone || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Experience</p>
                        <p className="font-medium text-gray-900">{formData.experience_years || 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Expected Salary</p>
                        <p className="font-medium text-gray-900">
                          {formData.expected_salary ? `₹${formData.expected_salary} per year` : 'Not provided'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Notice Period</p>
                        <p className="font-medium text-gray-900">{formData.notice_period || 'Not provided'}</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                      <label className="block text-gray-700 font-medium mb-2">
                        <Upload className="inline w-4 h-4 mr-1" />
                        Resume/CV *
                      </label>
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        name="resume_file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                            const maxSize = 5 * 1024 * 1024; // 5MB
                            
                            if (!allowedMimes.includes(file.type)) {
                              console.error('Only PDF and DOC files are allowed');
                              setResumeFile(null);
                              setResumeFileName('');
                              e.target.value = '';
                              return;
                            }
                            
                            if (file.size > maxSize) {
                              console.error('File size must be less than 5MB');
                              setResumeFile(null);
                              setResumeFileName('');
                              e.target.value = '';
                              return;
                            }
                            
                            setResumeFile(file);
                            setResumeFileName(file.name);
                            console.log(`Resume "${file.name}" selected`);
                          }
                        }}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        required
                      />
                      {resumeFileName && (
                        <p className="text-sm text-green-600 mt-2 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {resumeFileName}
                        </p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">Upload your resume in PDF or DOC format (max 5MB)</p>
                    </div>

                    <div>
                      <label className="block text-gray-700 font-medium mb-2">
                        <FileText className="inline w-4 h-4 mr-1" />
                        Cover Letter / Why GatiMitra?
                      </label>
                      <textarea 
                        name="cover_letter"
                        value={formData.cover_letter}
                        onChange={handleInputChange}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                        placeholder="Tell us why you're interested in joining our team..."
                      ></textarea>
                    </div>
                  </div>

                  <div className="flex items-center p-4 bg-blue-50 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-blue-600 mr-3" />
                    <p className="text-sm text-blue-700">
                      By submitting, you confirm that all information provided is accurate and complete.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:border-blue-600 hover:text-blue-600 transition-colors"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowApplicationModal(false)}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:border-blue-600 hover:text-blue-600 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                
                <button
                  type={currentStep === 3 ? 'submit' : 'button'}
                  onClick={currentStep < 3 ? nextStep : undefined}
                  disabled={isSubmitting}
                  className={`px-6 py-3 rounded-lg font-medium flex items-center transition-colors ${
                    isSubmitting 
                      ? 'bg-gray-400 text-white cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                      Submitting...
                    </>
                  ) : (
                    <>
                      {currentStep === 3 ? 'Submit Application' : 'Continue'}
                      {currentStep < 3 && <ArrowRight className="w-5 h-5 ml-2" />}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {showJobDetailsModal && selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="modal-content bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedJob.role || 'Position Details'}</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                    <MapPin className="w-3 h-3 mr-1" />
                    {selectedJob.location || 'Remote'}
                  </span>
                  <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    {selectedJob.experience || 'Experience not specified'}
                  </span>
                  <span className="inline-flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                    <IndianRupee className="w-3 h-3 mr-1" />
                    {selectedJob.salary || 'Salary not specified'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowJobDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-8">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Job Description</h3>
                <p className="text-gray-600">{selectedJob.description || 'No description available'}</p>
              </div>

              {selectedJob.requirements && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Requirements</h3>
                  <ul className="space-y-2">
                    {selectedJob.requirements.split(',').map((req, index) => (
                      <li key={index} className="flex items-start">
                        <CheckCircle className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-600">{req.trim()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedJob.responsibilities && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Responsibilities</h3>
                  <ul className="space-y-2">
                    {selectedJob.responsibilities.split(',').map((resp, index) => (
                      <li key={index} className="flex items-start">
                        <CheckCircle className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
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
                  className="w-full bg-blue-600 text-white py-3.5 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center"
                >
                  Apply for this Position
                  <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Careers;