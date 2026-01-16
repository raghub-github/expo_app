import React, { useState, useEffect } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FaPhone, FaTimes, FaShieldAlt, FaEdit } from 'react-icons/fa';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onPhoneLogin: (phone: string) => void;
  onGoogleLogin: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ open, onClose, onPhoneLogin, onGoogleLogin }) => {
  const [tab, setTab] = useState<'phone' | 'google'>('phone');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [editPhone, setEditPhone] = useState(false);

  // Generate OTP on client side only
  useEffect(() => {
    if (otpSent && !demoOtp) {
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      setDemoOtp(generatedOtp);
    }
  }, [otpSent, demoOtp]);

  const handleSendOtp = () => {
    if (phone.length !== 10) return;
    
    setIsLoading(true);
    setTimeout(() => {
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      setDemoOtp(generatedOtp);
      setOtpSent(true);
      setOtp('');
      setOtpError('');
      setCountdown(60);
      setIsLoading(false);
    }, 800);
  };

  const handleVerifyOtp = () => {
    if (otp.length !== 6) return;
    
    setIsLoading(true);
    setTimeout(() => {
      if (otp === demoOtp) {
        setOtpError('');
        onPhoneLogin(phone);
      } else {
        setOtpError('Invalid OTP. Please try again.');
      }
      setIsLoading(false);
    }, 800);
  };

  const handleResendOtp = () => {
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setDemoOtp(generatedOtp);
    setCountdown(60);
    setOtp('');
    setOtpError('');
  };

  const handleEditPhone = () => {
    setEditPhone(true);
    setOtpSent(false);
    setOtp('');
  };

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      onGoogleLogin();
      setIsLoading(false);
    }, 800);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center z-50 p-4">
      {/* Blue Blur Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 via-blue-500/20 to-indigo-600/30 backdrop-blur-xl"></div>
      
      {/* Modal Container */}
      <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/20">
        {/* Header */}
        <div className="relative p-6 border-b border-gray-200/50">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full hover:bg-gray-100/80 flex items-center justify-center text-gray-600 hover:text-gray-800 transition-all duration-200"
          >
            <FaTimes />
          </button>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800">Welcome to GatiMitra</h2>
            <p className="text-gray-600 mt-1 text-sm">Sign in to access your dashboard</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-5">
          <button
            onClick={() => setTab('phone')}
            className={`flex-1 py-3 text-center font-medium transition-all duration-200 ${
              tab === 'phone'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <FaPhone className={`text-sm ${tab === 'phone' ? 'text-blue-600' : 'text-gray-500'}`} />
              <span>Phone</span>
            </div>
          </button>
          <button
            onClick={() => setTab('google')}
            className={`flex-1 py-3 text-center font-medium transition-all duration-200 ${
              tab === 'google'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <FcGoogle className="text-base" />
              <span>Google</span>
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {tab === 'phone' && (
            <div className="space-y-5">
              {/* Phone Number Display when OTP is sent */}
              {otpSent && !editPhone ? (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-sm text-gray-600 font-medium">Sending OTP to</div>
                    <button
                      onClick={handleEditPhone}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1 transition-colors duration-200"
                    >
                      <FaEdit className="text-xs" />
                      Edit
                    </button>
                  </div>
                  <div className="text-lg font-bold text-gray-800">
                    +91 {phone}
                  </div>
                </div>
              ) : (
                /* Phone Input */
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <div className="phone-input-row">
                    <span className="country-code">+91</span>
                    <input
                      type="text"
                      placeholder="Enter phone number"
                      value={phone}
                      maxLength={10}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "").slice(-10);
                        setPhone(val);
                      }}
                      className="phone-input-box"
                    />
                  </div>
                  <div className="helper-msg">
                    Please enter a 10-digit phone number only. Do not include +91, 91, or 0.
                  </div>
                </div>
              )}

              {otpSent && !editPhone ? (
                <>
                  {/* OTP Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      placeholder="Enter 6-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full px-4 py-3.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-lg tracking-widest font-semibold placeholder-gray-400 transition-all duration-200"
                      maxLength={6}
                      autoFocus
                    />
                    
                    {/* Demo OTP & Resend */}
                    <div className="mt-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="text-sm bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                        <span className="text-blue-600 font-medium">Demo OTP: </span>
                        <span className="font-mono font-bold text-gray-800">{demoOtp}</span>
                      </div>
                      {countdown > 0 ? (
                        <span className="text-sm text-red-500 font-medium bg-red-50 px-3 py-1.5 rounded-lg whitespace-nowrap">
                          Resend in {countdown}s
                        </span>
                      ) : (
                        <button
                          onClick={handleResendOtp}
                          className="text-sm text-blue-600 font-medium hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors duration-200 whitespace-nowrap"
                        >
                          Resend OTP
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Verify Button */}
                  <button
                    onClick={handleVerifyOtp}
                    disabled={otp.length !== 6 || isLoading}
                    className={`w-full py-3.5 rounded-xl font-medium text-white transition-all duration-200 mt-2 ${
                      otp.length === 6 && !isLoading
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl'
                        : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Verifying...
                      </div>
                    ) : (
                      'Verify OTP'
                    )}
                  </button>

                  {/* Error Message */}
                  {otpError && (
                    <div className="text-red-600 text-sm text-center mt-2 bg-red-50 py-2 px-3 rounded-lg border border-red-100">
                      {otpError}
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={handleSendOtp}
                  disabled={!phone || phone.length !== 10 || isLoading}
                  className={`w-full py-3.5 rounded-xl font-medium text-white transition-all duration-200 ${
                    phone.length === 10 && !isLoading
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending OTP...
                    </div>
                  ) : (
                    'Send OTP'
                  )}
                </button>
              )}

              {/* Security Note */}
              <div className="mt-4 pt-4 border-t border-gray-200/50">
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                  <FaShieldAlt className="text-blue-500" />
                  <span className="font-medium">Your data is protected with end-to-end encryption</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'google' && (
            <div className="space-y-6">
              {/* Google Login Content */}
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-200/50">
                  <FcGoogle className="text-4xl" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  Sign in with Google
                </h3>
                <p className="text-gray-600 text-sm mb-6">
                  Quick and secure login using your Google account
                </p>

                {/* Google Login Button */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-3.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      Connecting...
                    </>
                  ) : (
                    <>
                      <FcGoogle className="text-xl" />
                      Continue with Google
                    </>
                  )}
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-white text-gray-500">Or</span>
                  </div>
                </div>

                {/* Switch to Phone */}
                <button
                  onClick={() => setTab('phone')}
                  className="w-full py-3.5 border border-blue-600 rounded-xl font-medium text-blue-600 hover:bg-blue-50 transition-all duration-200 flex items-center justify-center gap-3"
                >
                  <FaPhone className="text-blue-600" />
                  Use Phone Number
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-200/50">
          <p className="text-center text-sm text-gray-600">
            By continuing, you agree to our{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors duration-200">
              Terms
            </a>{' '}
            and{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors duration-200">
              Privacy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;