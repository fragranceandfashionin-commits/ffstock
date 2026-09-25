import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, type UserRole, type UserProfile, type AuthAction, ROLE_DEFINITIONS } from '@/lib/supabase';
import type { View } from '@/lib/types';

export type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole;
  roleDefinition: typeof ROLE_DEFINITIONS[UserRole];
  operatorName: string;
  loading: boolean;
  isAuthenticated: boolean;
  isDevMode: boolean;
  error: string | null;
  signIn: (email: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  canAccessView: (view: View) => boolean;
  canTransitionStage: (fromSeq: number, toSeq: number) => boolean;
  canPerform: (action: AuthAction) => boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

const DEV_MOCK_ROLE_KEY = 'ffstock_dev_mock_role';

export function isOperatorTransitionAllowed(
  role: UserRole,
  fromSeq: number,
  toSeq: number
): boolean {
  if (role === 'admin' || role === 'stock_manager') return true;

  switch (role) {
    case 'coloring_operator':
      // Raw(1)->Coloring(2), Coloring(2)->Printing(3), Coloring(2)->Filling(4), Coloring(2)->Scrap(8), Coloring(2)->Raw(1) [Reversal]
      return (fromSeq === 1 && toSeq === 2) || (fromSeq === 2 && [1, 3, 4, 8].includes(toSeq));

    case 'printing_operator':
      // Pull Raw(1)->Printing(3), Coloring(2)->Printing(3), Printing(3)->Filling(4), Printing(3)->Scrap(8), Printing(3)->Coloring(2), Printing(3)->Raw(1)
      return ([1, 2].includes(fromSeq) && toSeq === 3) || (fromSeq === 3 && [1, 2, 4, 8].includes(toSeq));

    case 'filling_operator':
      // Pull Raw(1)->Filling(4), Coloring(2)->Filling(4), Printing(3)->Filling(4), Filling(4)->Packaging(5), Filling(4)->Scrap(8), Filling(4)->Reversals(1,2,3)
      return ([1, 2, 3].includes(fromSeq) && toSeq === 4) || (fromSeq === 4 && [1, 2, 3, 5, 8].includes(toSeq));

    case 'packaging_operator':
      // Filling(4)->Packaging(5), Packaging(5)->Ready(6), Packaging(5)->Scrap(8), Packaging(5)->Filling(4) [Reversal]
      return (fromSeq === 4 && toSeq === 5) || (fromSeq === 5 && [4, 6, 8].includes(toSeq));

    default:
      return false;
  }
}

export function canAccessView(role: UserRole, view: View): boolean {
  if (role === 'admin' || role === 'viewer') return true;

  switch (role) {
    case 'inward_manager':
      return ['dashboard', 'items', 'suppliers'].includes(view);
    case 'coloring_operator':
    case 'printing_operator':
    case 'filling_operator':
    case 'packaging_operator':
      return ['dashboard', 'outward'].includes(view);
    case 'stock_manager':
      return ['dashboard', 'items', 'outward', 'order-history'].includes(view);
    case 'dispatch_manager':
      return ['dashboard', 'outward', 'orders', 'order-history'].includes(view);
    case 'vendor_manager':
      return ['dashboard', 'orders', 'vendor-pending', 'suppliers', 'clients', 'order-history'].includes(view);
    default:
      return false;
  }
}

export function canPerformAction(role: UserRole, action: AuthAction): boolean {
  if (role === 'admin') return true;
  if (role === 'viewer') return false;

  switch (action) {
    case 'inward':
      return ['admin', 'inward_manager'].includes(role);
    case 'stage_move':
      return ['admin', 'stock_manager', 'coloring_operator', 'printing_operator', 'filling_operator', 'packaging_operator'].includes(role);
    case 'dispatch':
      return ['admin', 'dispatch_manager'].includes(role);
    case 'manage_orders':
      return ['admin', 'vendor_manager'].includes(role);
    case 'manage_items':
      return ['admin', 'stock_manager'].includes(role);
    case 'manage_suppliers':
      return ['admin', 'vendor_manager', 'inward_manager'].includes(role);
    case 'manage_clients':
      return ['admin', 'vendor_manager'].includes(role);
    case 'reverse_allocation':
      return ['admin', 'stock_manager'].includes(role);
    default:
      return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole>(() => {
    // In dev mode, check if a dev mock role was persisted
    if (import.meta.env.DEV) {
      const devSaved = localStorage.getItem(DEV_MOCK_ROLE_KEY);
      if (devSaved && devSaved in ROLE_DEFINITIONS) {
        return devSaved as UserRole;
      }
    }
    // Safe enterprise default: viewer (read-only until authenticated)
    return 'viewer';
  });
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Load active session and fetch profile from user_profiles table with resilient fallbacks
  const loadProfile = useCallback(
    async (
      userId: string,
      email?: string,
      userMetadata?: Record<string, any>
    ): Promise<UserProfile | null> => {
      try {
        const queryPromise = supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        const timeoutPromise = new Promise<{ data: null; error: null }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: null }), 4000)
        );

        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

        if (error && error.code !== 'PGRST116') {
          console.warn('Could not load user profile:', error);
        }

        if (data && data.role) {
          return data as UserProfile;
        }

        // Determine fallback role from user metadata or known email patterns
        let derivedRole: UserRole = 'viewer';
        if (userMetadata?.role && userMetadata.role in ROLE_DEFINITIONS) {
          derivedRole = userMetadata.role as UserRole;
        } else if (email?.toLowerCase().startsWith('admin@')) {
          derivedRole = 'admin';
        } else if (email) {
          const matched = Object.keys(ROLE_DEFINITIONS).find(
            (r) => r !== 'viewer' && email.toLowerCase().includes(r.replace('_', ''))
          ) as UserRole | undefined;
          if (matched) derivedRole = matched;
        }

        const derivedName =
          userMetadata?.display_name ||
          (derivedRole in ROLE_DEFINITIONS ? ROLE_DEFINITIONS[derivedRole].name : null) ||
          (email ? email.split('@')[0] : 'Factory Operator');

        const fallbackProfile: UserProfile = {
          id: userId,
          email: email || null,
          display_name: derivedName,
          role: derivedRole,
          is_active: true,
          created_at: new Date().toISOString(),
        };

        // Asynchronously upsert profile to repair missing database records in background
        supabase
          .from('user_profiles')
          .upsert({
            id: userId,
            email: email || null,
            display_name: derivedName,
            role: derivedRole,
            is_active: true,
          })
          .then(({ error: upsertErr }) => {
            if (upsertErr) console.warn('Auto-repair profile upsert notice:', upsertErr);
          })
          .catch(() => {});

        return fallbackProfile;
      } catch {
        return null;
      }
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    // Safety fallback: Never keep the workstation stuck in loading state for more than 1.5 seconds
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 1500);

    async function initAuth() {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 1200)
        );
        const { data: { session: currentSession } } = await Promise.race([sessionPromise, timeoutPromise]);
        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          const prof = await loadProfile(currentSession.user.id, currentSession.user.email, currentSession.user.user_metadata);
          if (isMounted) {
            setProfile(prof);
            if (prof?.role) {
              setRole(prof.role);
            }
          }
        } else if (import.meta.env.DEV) {
          const devSaved = localStorage.getItem(DEV_MOCK_ROLE_KEY);
          if (devSaved && devSaved in ROLE_DEFINITIONS) {
            const devRole = devSaved as UserRole;
            setRole(devRole);
            setProfile({
              id: `dev-${devRole}`,
              email: `${devRole}@factory.local`,
              display_name: ROLE_DEFINITIONS[devRole].name,
              role: devRole,
              is_active: true,
              created_at: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn('Auth initialization error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        const prof = await loadProfile(newSession.user.id, newSession.user.email, newSession.user.user_metadata);
        if (isMounted) {
          setProfile(prof);
          if (prof?.role) {
            setRole(prof.role);
          }
        }
      } else {
        if (import.meta.env.DEV) {
          const devSaved = localStorage.getItem(DEV_MOCK_ROLE_KEY);
          if (devSaved && devSaved in ROLE_DEFINITIONS) {
            // Keep dev mock profile in dev mode
            setLoading(false);
            return;
          }
        }
        setProfile(null);
        setRole('viewer');
      }
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const switchRole = useCallback((newRole: UserRole) => {
    setRole(newRole);
    if (import.meta.env.DEV) {
      localStorage.setItem(DEV_MOCK_ROLE_KEY, newRole);
      setProfile({
        id: `dev-${newRole}`,
        email: `${newRole}@factory.local`,
        display_name: ROLE_DEFINITIONS[newRole].name,
        role: newRole,
        is_active: true,
        created_at: new Date().toISOString(),
      });
    }
  }, []);

  const signIn = useCallback(async (email: string, password?: string) => {
    setAuthError(null);

    // In production, password is strictly mandatory
    if (!import.meta.env.DEV && !password) {
      const err = new Error('Password is required for workstation authentication.');
      setAuthError(err.message);
      throw err;
    }

    if (password) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // If in DEV mode and remote auth failed, allow graceful dev mock fallback
          if (import.meta.env.DEV) {
            console.warn('Dev mode: remote sign in failed, falling back to local dev session', error.message);
            const matchedRole = (Object.keys(ROLE_DEFINITIONS).find((r) =>
              email.toLowerCase().includes(r.replace('_', '')) || email.toLowerCase().includes(r)
            ) as UserRole) || 'admin';
            switchRole(matchedRole);
            return;
          }
          throw error;
        }
        if (data.user) {
          setUser(data.user);
          setSession(data.session);
          const prof = await loadProfile(data.user.id, data.user.email, data.user.user_metadata);
          setProfile(prof);
          if (prof?.role) {
            setRole(prof.role);
          }
        }
        return;
      } catch (err: unknown) {
        if (!import.meta.env.DEV) {
          const msg = err instanceof Error ? err.message : 'Authentication failed';
          setAuthError(msg);
          throw err;
        }
      }
    }

    // Dev environment 1-click fallback
    if (import.meta.env.DEV) {
      const syntheticId = `dev-${email.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const matchedRole = (Object.keys(ROLE_DEFINITIONS).find((r) =>
        email.toLowerCase().includes(r.replace('_', '')) || email.toLowerCase().includes(r)
      ) as UserRole) || 'admin';
      switchRole(matchedRole);
      setProfile({
        id: syntheticId,
        email,
        display_name: ROLE_DEFINITIONS[matchedRole].name,
        role: matchedRole,
        is_active: true,
        created_at: new Date().toISOString(),
      });
    }
  }, [loadProfile, switchRole]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignored
    }
    if (import.meta.env.DEV) {
      localStorage.removeItem(DEV_MOCK_ROLE_KEY);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole('viewer');
    setAuthError(null);
  }, []);

  const isAuthenticated = useMemo(() => {
    if (user !== null) return true;
    if (import.meta.env.DEV && profile !== null && role !== 'viewer') return true;
    return false;
  }, [user, profile, role]);

  const contextValue = useMemo<AuthContextType>(() => {
    const operatorName = profile?.display_name || user?.email?.split('@')[0] || ROLE_DEFINITIONS[role].name;
    return {
      user,
      session,
      profile,
      role,
      roleDefinition: ROLE_DEFINITIONS[role],
      operatorName,
      loading,
      isAuthenticated,
      isDevMode: Boolean(import.meta.env.DEV),
      error: authError,
      signIn,
      signOut,
      switchRole,
      canAccessView: (view: View) => canAccessView(role, view),
      canTransitionStage: (fromSeq: number, toSeq: number) => isOperatorTransitionAllowed(role, fromSeq, toSeq),
      canPerform: (action: AuthAction) => canPerformAction(role, action),
    };
  }, [user, session, profile, role, loading, isAuthenticated, authError, signIn, signOut, switchRole]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
