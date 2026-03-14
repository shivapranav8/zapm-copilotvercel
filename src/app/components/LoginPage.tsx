import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface LoginPageProps {
  onLogin: (username: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleZohoLogin = () => {
    setIsLoading(true);
    // Redirect to backend which sends user to Zoho's login page.
    // The backend function is deployed as /server/node-server/ on Catalyst
    window.location.href = import.meta.env?.DEV
      ? 'http://localhost:5001/api/auth/login'
      : '/api/auth/login';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl mb-4 shadow-lg">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl text-gray-900 mb-2">ZA - PM Co Pilot</h1>
          <p className="text-gray-600">Sign in to your Zoho account</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* Welcome Text */}
          <div className="text-center mb-6">
            <h2 className="text-xl text-gray-900 mb-2">Welcome Back</h2>
            <p className="text-sm text-gray-600">
              Access your AI-powered Product Management tools
            </p>
          </div>

          {/* Sign In Button */}
          <button
            onClick={handleZohoLogin}
            disabled={isLoading}
            className={`w-full py-4 rounded-lg font-medium transition-all text-lg ${isLoading
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl'
              }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign in with Zoho'
            )}
          </button>

          {/* Features Preview */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center mb-3">What's included:</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-purple-600 rounded-full"></div>
                <span>PM Buddy</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-purple-600 rounded-full"></div>
                <span>Meeting MoM</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-purple-600 rounded-full"></div>
                <span>Ticket Generator</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-purple-600 rounded-full"></div>
                <span>PRD & FRD Tools</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          {/* Removed sign up text */}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs text-blue-800">
            Sign in with your Zoho account. Each team member sees only their own tickets and meetings.
          </p>
        </div>
      </div>
    </div>
  );
}