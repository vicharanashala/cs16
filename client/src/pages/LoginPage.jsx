import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import { forgotPassword, resendVerification, register as apiRegister } from '../services/api';

const evaluatePasswordStrength = (pwd) => {
  if (!pwd) {
    return {
      score: 0,
      label: '',
      color: 'bg-slate-200 dark:bg-slate-800',
      level: 0,
      criteria: {
        hasMinLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSymbol: false,
      }
    };
  }

  const hasMinLength = pwd.length >= 8;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);

  const criteria = [hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSymbol];
  const score = criteria.filter(Boolean).length;

  let label = 'Weak';
  let color = 'bg-red-500';
  let level = 1; // 1: Weak, 2: Fair, 3: Strong

  if (score === 5) {
    label = 'Strong';
    color = 'bg-emerald-500';
    level = 3;
  } else if (score >= 3) {
    label = 'Fair';
    color = 'bg-amber-500';
    level = 2;
  }

  return {
    score,
    label,
    color,
    level,
    criteria: {
      hasMinLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      hasSymbol,
    }
  };
};

function LoginPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const isRegisterPath = location.pathname === '/register';
  const [isLogin, setIsLogin] = useState(
    isRegisterPath ? false : (location.state?.wantsSignup ? false : true)
  );

  const passwordStrength = !isLogin ? evaluatePasswordStrength(form.password) : null;

  useEffect(() => {
    const isRegister = location.pathname === '/register';
    setIsLogin(isRegister ? false : (location.state?.wantsSignup ? false : true));
    setError('');
    setShowForgot(false);
  }, [location.pathname, location.state]);

  const from = (location.state?.from && location.state?.from !== '/login')
    ? location.state.from
    : '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const loggedInUser = await login(form.email, form.password);
        if (loggedInUser && loggedInUser.role === 'admin') {
          navigate('/admin', { replace: true });
        } else {
          navigate(from, { replace: true });
        }
      } else {
        if (!form.name.trim()) {
          setError('Name is required');
          setLoading(false);
          return;
        }
        const strength = evaluatePasswordStrength(form.password);
        if (strength.score < 5) {
          setError('Password must meet all complexity requirements: minimum 8 characters, with uppercase, lowercase, numbers, and symbols.');
          setLoading(false);
          return;
        }
        await apiRegister({ name: form.name, email: form.email, password: form.password });
        setIsLogin(true);
        setForm(prev => ({ ...prev, password: '' })); // Clear password
        toast.success('Registration successful! Please sign in with your credentials.');
      }
    } catch (err) {
      setError(err.response?.data?.error || (isLogin ? 'Login failed' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setForm({ name: '', email: 'admin@faqapp.com', password: 'admin123' });
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login('admin@faqapp.com', 'admin123');
      if (loggedInUser && loggedInUser.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        const destination = from !== '/login' ? from : '/';
        navigate(destination, { replace: true });
      }
    } catch (err) {
      setError('Login failed — make sure you\'ve run the seed script');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setLoading(true);
    try {
      await forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      await resendVerification();
      toast.success('Verification email sent! Check your inbox.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send email');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md card bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] backdrop-blur-md">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-1">
            {isLogin ? 'Welcome Back' : 'Join Grantha'}
          </h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
            {isLogin
              ? 'Sign in to raise queries and help others'
              : 'Create an account to participate in the community'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 px-4 py-2.5 rounded-xl mb-4 text-xs">
            {error}
          </div>
        )}

        {/* Forgot Password Panel */}
        {isLogin && showForgot && (
          <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-200/40 dark:border-slate-800/40 rounded-2xl p-5 mb-5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-2">
              {forgotSent ? '✓ Check your email' : 'Reset your password'}
            </h3>
            {forgotSent ? (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                  If that email address is registered with us, we've sent a password reset link.
                  It expires in 1 hour.
                </p>
                <button
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors hover:underline font-medium"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter your email and we'll send you a reset link.
                </p>
                <input
                  type="email"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/15 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/5 focus:border-slate-400 transition-all placeholder-slate-400/70"
                  placeholder="you@university.edu"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={loading} className="btn-primary text-xs py-2 flex-1 rounded-xl">
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    className="btn-ghost text-xs py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Full Name
              </label>
              <input
                type="text"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/15 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/5 focus:border-slate-400 transition-all placeholder-slate-400/70"
                placeholder="Priya Sharma"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required={!isLogin}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Email Address
            </label>
            <input
              type="email"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/15 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/5 focus:border-slate-400 transition-all placeholder-slate-400/70"
              placeholder="you@university.edu"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/15 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/5 focus:border-slate-400 transition-all placeholder-slate-400/70"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={isLogin ? 6 : 8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.43 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            {!isLogin && form.password && passwordStrength && (
              <div className="mt-3 space-y-2 text-left">
                {/* Progressive Bar */}
                <div className="flex h-1.5 gap-1.5">
                  <div className={`h-full flex-1 rounded-sm transition-all duration-300 ${passwordStrength.level >= 1 ? (passwordStrength.level === 1 ? 'bg-red-500' : passwordStrength.level === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-200 dark:bg-slate-800'}`} />
                  <div className={`h-full flex-1 rounded-sm transition-all duration-300 ${passwordStrength.level >= 2 ? (passwordStrength.level === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-200 dark:bg-slate-800'}`} />
                  <div className={`h-full flex-1 rounded-sm transition-all duration-300 ${passwordStrength.level >= 3 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />
                </div>
                
                {/* Label */}
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 dark:text-slate-500">Password strength:</span>
                  <span className={`font-semibold transition-colors duration-300 ${
                    passwordStrength.level === 1 ? 'text-red-500' : passwordStrength.level === 2 ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {passwordStrength.label}
                  </span>
                </div>

                {/* Checklist */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] pt-1">
                  <div className={`flex items-center gap-1.5 transition-colors duration-200 ${passwordStrength.criteria.hasMinLength ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <span>{passwordStrength.criteria.hasMinLength ? '✓' : '○'}</span>
                    <span>Min. 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors duration-200 ${passwordStrength.criteria.hasUppercase ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <span>{passwordStrength.criteria.hasUppercase ? '✓' : '○'}</span>
                    <span>Uppercase letter</span>
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors duration-200 ${passwordStrength.criteria.hasLowercase ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <span>{passwordStrength.criteria.hasLowercase ? '✓' : '○'}</span>
                    <span>Lowercase letter</span>
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors duration-200 ${passwordStrength.criteria.hasNumber ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <span>{passwordStrength.criteria.hasNumber ? '✓' : '○'}</span>
                    <span>Number (0-9)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 transition-colors duration-200 ${passwordStrength.criteria.hasSymbol ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <span>{passwordStrength.criteria.hasSymbol ? '✓' : '○'}</span>
                    <span>Symbol (special char)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 text-white dark:text-slate-950 text-sm font-medium tracking-wide shadow-sm hover:shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        {/* Forgot password link */}
        {isLogin && !showForgot && (
          <div className="text-right mt-2">
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors font-medium"
            >
              Forgot password?
            </button>
          </div>
        )}

        {/* Toggle */}
        <div className="text-center mt-5">
          <button
            type="button"
            onClick={() => {
              const targetPath = isLogin ? '/register' : '/login';
              navigate(targetPath, { replace: true });
              setIsLogin(!isLogin);
              setError('');
              setShowForgot(false);
            }}
            className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:underline font-medium transition-colors"
          >
            {isLogin
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>

        {/* Info Box */}
        {isLogin && (
          <details className="mt-5 group border border-slate-200/40 dark:border-slate-800/40 rounded-2xl p-3 bg-slate-50/20 dark:bg-slate-950/10 transition-all select-none">
            <summary className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer flex items-center justify-between">
              <span>Need demo credentials?</span>
              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </summary>
            <div className="mt-2.5 pt-2.5 border-t border-slate-200/30 dark:border-slate-800/30 text-xs text-slate-400 dark:text-slate-500 space-y-2.5">
              <p>👤 <span className="font-medium text-slate-600 dark:text-slate-300">Admin User</span> — admin@faqapp.com</p>
              <p>Password: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">admin123</span></p>
              <p className="text-[10px] text-amber-500/80">Run <code className="bg-amber-100/50 dark:bg-amber-950/20 px-1 rounded">npm run seed</code> first if login fails.</p>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full mt-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all duration-150"
                disabled={loading}
              >
                Sign in automatically with Demo
              </button>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default LoginPage;