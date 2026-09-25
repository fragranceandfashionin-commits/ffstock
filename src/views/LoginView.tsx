import { useState } from 'react';
import {
  Lock,
  Mail,
  ArrowRight,
  X,
  Factory,
  LogOut,
  ShieldCheck,
  Code2,
} from 'lucide-react';
import { Button, Card, Field, inputClass } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ROLE_DEFINITIONS, type UserRole } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export type LoginViewProps = {
  isOpen?: boolean;
  onClose?: () => void;
  standalone?: boolean;
};

export function LoginView({ isOpen = true, onClose, standalone = false }: LoginViewProps) {
  const {
    signIn,
    signOut,
    role: currentRole,
    roleDefinition,
    profile,
    isAuthenticated,
    isDevMode,
    switchRole,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  if (!standalone && !isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your factory work email or operator ID.');
      return;
    }
    if (!isDevMode && !password.trim()) {
      setError('Workstation password is required.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password ? password : undefined);
      toast.success('Workstation authenticated successfully.', 'Authentication Success');
      if (onClose) onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Authentication failed. Please verify your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      toast.info('Signed out of workstation. Station returned to Auditor mode.', 'Shift Handover');
      if (onClose && !standalone) onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to sign out.'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRoleSwitch = (roleKey: UserRole) => {
    switchRole(roleKey);
    const def = ROLE_DEFINITIONS[roleKey];
    toast.success(`Switched active workstation to ${def.label}.`, 'Role Switched (Dev Mode)');
    if (onClose) onClose();
  };

  const cardContent = (
    <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-2xl rounded-3xl relative overflow-hidden w-full max-w-lg">
      {/* Top Accent Stripe */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-600 via-sky-500 to-indigo-600" />

      {/* Close button (Only in modal mode) */}
      {!standalone && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="mx-auto h-13 w-13 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 mb-3">
          <Factory className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
          Fragrance &amp; Fashion ERP
        </h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Factory Workstation &amp; Manufacturing Line Authentication
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Active Shift Handover View (When Already Logged In) */}
      {isAuthenticated && (
        <div className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Active Shift Operator
            </span>
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${roleDefinition.color}`}>
              {roleDefinition.label}
            </span>
          </div>

          <div>
            <p className="text-base font-black text-slate-900">
              {profile?.display_name || 'Line Operator'}
            </p>
            <p className="text-xs text-slate-500 font-medium">
              {profile?.email || 'Shared Factory Terminal'} • {roleDefinition.department}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={loading}
            className="w-full font-bold text-xs border-slate-300 text-rose-700 hover:bg-rose-50 hover:border-rose-300 cursor-pointer justify-center"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Handover Station / Sign Out
          </Button>
        </div>
      )}

      {/* Credential Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <Field label="Workstation Email / Operator ID" htmlFor="login-email" required>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. coloring.line1@factory.local"
              className={`${inputClass} pl-10`}
              autoFocus={!isAuthenticated}
            />
          </div>
        </Field>

        <Field
          label={isDevMode ? 'Workstation Password (Optional in Dev)' : 'Workstation Password'}
          htmlFor="login-password"
          required={!isDevMode}
        >
          <div className="relative">
            <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`${inputClass} pl-10`}
            />
          </div>
        </Field>

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          className="w-full py-2.5 font-black text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer justify-center"
        >
          {loading ? 'Authenticating Workstation...' : 'Sign In to Workstation'}
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </form>

      {/* Engineering Dev-Only Station Presets (Excluded in Production Builds) */}
      {import.meta.env.DEV && (
        <div className="border-t border-dashed border-amber-300 pt-4 bg-amber-50/40 -mx-6 -mb-6 p-6">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-amber-600" />
              Dev Environment Only • 1-Click Role Presets
            </span>
            <span className="text-[9px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
              DEV MODE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
            {(Object.keys(ROLE_DEFINITIONS) as UserRole[]).map((roleKey) => {
              const def = ROLE_DEFINITIONS[roleKey];
              const isActive = currentRole === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => handleQuickRoleSwitch(roleKey)}
                  className={`text-left p-2 rounded-xl border text-xs transition cursor-pointer flex flex-col ${
                    isActive
                      ? 'border-indigo-600 bg-white ring-2 ring-indigo-400 font-bold shadow-xs'
                      : 'border-amber-200/80 bg-white/90 hover:bg-amber-100/60 text-slate-700'
                  }`}
                >
                  <span className="font-extrabold text-[11px] text-slate-900 truncate">
                    {def.label}
                  </span>
                  <span className="text-[9px] text-slate-500 font-medium truncate">
                    {def.department}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        {/* Background Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 w-full flex justify-center">
          {cardContent}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      {cardContent}
    </div>
  );
}
