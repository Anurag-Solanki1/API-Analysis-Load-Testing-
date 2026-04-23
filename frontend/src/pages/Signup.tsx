import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { Mail, Lock, User, UserPlus, Zap, KeyRound } from "lucide-react";
import Spotlight from "@/components/ui/spotlight";
import GridPattern from "@/components/ui/grid-pattern";

export default function Signup() {
  const { signup, verifyOtp, resendOtp, loginWithGoogle, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !loading) navigate("/");
  }, [isAuthenticated, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      setError("Password must be at least 8 characters long, with uppercase, lowercase, and a special character.");
      return;
    }
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const requireOtp = await signup(name, email, password);
      if (requireOtp) {
          setStep(2);
      } else {
          navigate("/");
      }
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setSubmitting(true);
      try {
          await verifyOtp(email, otp);
          navigate("/");
      } catch(err: any) {
          setError(err.message || "Invalid verification code");
      } finally {
          setSubmitting(false);
      }
  };

  const handleResend = async () => {
      setResending(true);
      setError("");
      setResendMessage("");
      try {
          await resendOtp(email);
          setResendMessage("A new code has been sent!");
      } catch(err: any) {
          setError(err.message || "Failed to resend code");
      } finally {
          setResending(false);
      }
  };

  if (loading) return null;

  return (
    <div className="flex min-h-screen bg-[#06080e] w-full flex-row-reverse">
      {/* Right Panel (Branding) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-l border-white/5 bg-[#0a0e1a] p-12 lg:flex">
        <GridPattern className="opacity-40" />
        <Spotlight className="-top-40 right-0" fill="rgba(6, 182, 212, 0.15)" />

        <div className="relative z-10 flex justify-end">
          <div className="flex items-center gap-2.5">
            <span className="text-xl font-bold tracking-tight text-white">
              API Analyst
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500 shadow-lg shadow-cyan-500/20">
              <Zap size={20} className="text-white fill-white/20" />
            </div>
          </div>
        </div>

        <div className="relative z-10 mb-10 text-right">
          <h1 className="mb-6 text-4xl font-bold leading-[1.15] tracking-tight text-white">
            Start optimizing your <br />
            <span className="bg-gradient-to-l from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              API performance.
            </span>
          </h1>
          <p className="ml-auto max-w-md text-lg text-txt-muted">
            Create your account to unlock powerful code analysis and real-time load testing capabilities.
          </p>
        </div>

        {/* Decorative bottom element */}
        <div className="absolute -bottom-[20%] -right-[10%] z-0 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[100px]" />
      </div>

      {/* Left Panel (Form) */}
      <div className="flex w-full flex-col items-center justify-center p-8 lg:w-1/2 relative overflow-hidden">
        {/* Mobile only branding */}
        <div className="absolute top-8 left-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-500 shadow-md">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold tracking-tight text-white">API Analyst</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[380px]"
        >
          {step === 1 ? (
          <>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Create account
            </h2>
            <p className="mt-2 text-sm text-txt-muted">
              Get started with API Analyst for free.
            </p>
          </div>

          <button
            type="button"
            onClick={loginWithGoogle}
            className="group mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-surface-card py-3 text-sm font-semibold text-white transition-all hover:bg-white/[0.04] hover:border-white/20 active:scale-[0.98]"
          >
            <svg className="h-[18px] w-[18px] transition-transform group-hover:scale-110" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.56-2.77z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign up with Google
          </button>

          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-txt-muted uppercase tracking-wider font-medium">or register with email</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-txt-secondary">
                Username
              </label>
              <div className="relative">
                <User
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted"
                />
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-surface-card px-10 py-2.5 text-sm text-white placeholder-txt-muted transition-all focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Enter username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-txt-secondary">
                Email
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted"
                />
                <input
                  type="email"
                  className="w-full rounded-xl border border-white/10 bg-surface-card px-10 py-2.5 text-sm text-white placeholder-txt-muted transition-all focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-txt-secondary">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted"
                />
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-surface-card px-10 py-2.5 text-sm text-white placeholder-txt-muted transition-all focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-txt-secondary">
                Confirm Password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted"
                />
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-surface-card px-10 py-2.5 text-sm text-white placeholder-txt-muted transition-all focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
                <div className="mt-0.5">•</div>
                <div>{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-black transition-all hover:bg-gray-200 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
            >
              {submitting ? (
                "Creating account..."
              ) : (
                <>
                  Create Account <UserPlus size={16} className="ml-1" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-txt-muted">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-white transition-colors hover:text-cyan-400 underline decoration-white/30 underline-offset-4 hover:decoration-cyan-400"
            >
              Sign in
            </Link>
          </p>
          </>
          ) : (
          <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full"
          >
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Check your email
                </h2>
                <p className="mt-2 text-sm text-txt-muted leading-relaxed">
                  We've sent a 6-digit verification code to <br/>
                  <span className="font-semibold text-white">{email}</span>.
                </p>
            </div>

            <form onSubmit={handleVerify} className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-txt-secondary">
                    Verification Code
                  </label>
                  <div className="relative">
                    <KeyRound
                      size={18}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted"
                    />
                    <input
                      type="text"
                      className="w-full rounded-xl border border-white/10 bg-surface-card px-10 py-2.5 text-sm text-white placeholder-txt-muted transition-all focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 tracking-widest"
                      placeholder="000000"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
                    <div className="mt-0.5">•</div>
                    <div>{error}</div>
                  </div>
                )}

                {resendMessage && (
                  <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400 flex items-start gap-2">
                    <div className="mt-0.5">✓</div>
                    <div>{resendMessage}</div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || otp.length < 6}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-black transition-all hover:bg-gray-200 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                >
                  {submitting ? "Verifying..." : "Verify & Continue"}
                </button>
            </form>

            <p className="mt-8 text-center text-sm text-txt-muted">
                Didn't receive the code?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="font-semibold text-white transition-colors hover:text-cyan-400 underline decoration-white/30 underline-offset-4 hover:decoration-cyan-400 disabled:opacity-50 disabled:no-underline"
                >
                  {resending ? "Sending..." : "Resend code"}
                </button>
            </p>
          </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
