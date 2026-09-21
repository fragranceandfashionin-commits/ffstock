import { useState } from 'react';
import {
  Lock,
  Mail,
  UserCheck,
  ArrowRight,
  X,
  Factory,
} from 'lucide-react';
import { Button, Card, Field, inputClass } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ROLE_DEFINITIONS, type UserRole } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export type LoginViewProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LoginView({ isOpen, onClose }: LoginViewProps) {
  const { signIn, role: currentRole, switchRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your factory work email or operator ID.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password ? password : undefined);
      toast.success(`Logged in successfully.`, 'Authentication Success');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to sign in. Please verify your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRoleSwitch = (roleKey: UserRole) => {
    switchRole(roleKey);
    const def = ROLE_DEFINITIONS[roleKey];
    toast.success(`Switched active workstation to ${def.label}.`, 'Role Switched');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg">
        <Card className="p-6 bg-white border border-slate-200 shadow-2xl rounded-3xl relative overflow-hidden">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 mb-3">
              <Factory className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Fragrance & Fashion ERP</h2>
            <p className="text-xs text-slate-500 mt-1">
              Factory Workstation & Line Operator Authentication
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Credential Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5 mb-6">
            <Field label="Workstation Email / Operator ID" htmlFor="login-email" required>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. operator@factory.local"
                  className={`${inputClass} pl-10`}
                  autoFocus
                />
              </div>
            </Field>

            <Field label="Password (Optional for local shift workstations)" htmlFor="login-password">
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
              {loading ? 'Authenticating...' : 'Sign In to Station'}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </form>

          {/* Quick Role Switcher for Shift Testing */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                Shift Handover / Role Presets
              </span>
              <span className="text-[10px] text-slate-400 font-medium">1-Click Station Switch</span>
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
                        ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-400 font-bold'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/90 text-slate-700'
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
        </Card>
      </div>
    </div>
  );
}
