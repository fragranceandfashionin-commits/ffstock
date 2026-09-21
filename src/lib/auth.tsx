import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, type UserRole, type UserProfile, ROLE_DEFINITIONS } from '@/lib/supabase';
import type { View } from '@/lib/types';

export type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole;
  roleDefinition: typeof ROLE_DEFINITIONS[UserRole];
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  canAccessView: (view: View) => boolean;
  canTransitionStage: (fromSeq: number, toSeq: number) => boolean;
  canPerform: (action: 'inward' | 'stage_move' | 'dispatch' | 'manage_orders' | 'manage_items' | 'reverse_allocation') => boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_ROLE_KEY = 'ffstock_active_role';

export function isOperatorTransitionAllowed(
  role: UserRole,
  fromSeq: number,
  toSeq: number
): boolean {
  if (role === 'admin') return true;

  switch (role) {
    case 'coloring_operator':
      // Raw(1)->Coloring(2), Coloring(2)->Printing(3), Coloring(2)->Scrap(8), Coloring(2)->Raw(1) [Reversal]
      return (fromSeq === 1 && toSeq === 2) || (fromSeq === 2 && [1, 3, 8].includes(toSeq));

    case 'printing_operator':
      // Printing(3)->Filling(4), Printing(3)->Scrap(8), Printing(3)->Coloring(2) [Reversal]
      return fromSeq === 3 && [2, 4, 8].includes(toSeq);

    case 'filling_operator':
      // Filling(4)->Packaging(5), Filling(4)->Scrap(8), Filling(4)->Printing(3) [Reversal]
      return fromSeq === 4 && [3, 5, 8].includes(toSeq);

    case 'packaging_operator':
      // Packaging(5)->Ready(6), Packaging(5)->Scrap(8), Packaging(5)->Filling(4) [Reversal]
      return fromSeq === 5 && [4, 6, 8].includes(toSeq);

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem(STORAGE_ROLE_KEY);
    if (saved && saved in ROLE_DEFINITIONS) {
      return saved as UserRole;
    }
    return 'admin'; // Factory workspace default for seamless handover
  });
  const [loading, setLoading] = useState(true);

  // Load active session and fetch profile if logged in
  const loadProfile = useCallback(async (userId: string, email?: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Could not load user profile:', error);
      }

      if (data) {
        return data as UserProfile;
      }

      // Default synthetic profile for active user
      return {
        id: userId,
        email: email || null,
        display_name: email ? email.split('@')[0] : 'Factory Operator',
        role: activeRole,
        is_active: true,
        created_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }, [activeRole]);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          const prof = await loadProfile(currentSession.user.id, currentSession.user.email);
          if (isMounted) {
            setProfile(prof);
            if (prof?.role) {
              setActiveRole(prof.role);
            }
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
        const prof = await loadProfile(newSession.user.id, newSession.user.email);
        if (isMounted) {
          setProfile(prof);
          if (prof?.role) {
            setActiveRole(prof.role);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const switchRole = useCallback((newRole: UserRole) => {
    setActiveRole(newRole);
    localStorage.setItem(STORAGE_ROLE_KEY, newRole);
  }, []);

  const signIn = useCallback(async (email: string, password?: string) => {
    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      // Direct workstation assignment switch
      const syntheticId = `operator-${email.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const matchedRole = Object.keys(ROLE_DEFINITIONS).find((r) => email.toLowerCase().includes(r)) as UserRole || 'admin';
      switchRole(matchedRole);
      setProfile({
        id: syntheticId,
        email,
        display_name: email.split('@')[0],
        role: matchedRole,
        is_active: true,
        created_at: new Date().toISOString(),
      });
    }
  }, [switchRole]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignored
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    switchRole('viewer');
  }, [switchRole]);

  const canPerformAction = useCallback(
    (action: 'inward' | 'stage_move' | 'dispatch' | 'manage_orders' | 'manage_items' | 'reverse_allocation'): boolean => {
      if (activeRole === 'admin') return true;
      if (activeRole === 'viewer') return false;

      switch (action) {
        case 'inward':
          return ['admin', 'inward_manager'].includes(activeRole);
        case 'stage_move':
          return ['admin', 'coloring_operator', 'printing_operator', 'filling_operator', 'packaging_operator'].includes(activeRole);
        case 'dispatch':
          return ['admin', 'dispatch_manager'].includes(activeRole);
        case 'manage_orders':
          return ['admin', 'vendor_manager'].includes(activeRole);
        case 'manage_items':
          return ['admin', 'stock_manager'].includes(activeRole);
        case 'reverse_allocation':
          return ['admin', 'stock_manager'].includes(activeRole);
        default:
          return false;
      }
    },
    [activeRole]
  );

  const contextValue = useMemo<AuthContextType>(() => {
    return {
      user,
      session,
      profile,
      role: activeRole,
      roleDefinition: ROLE_DEFINITIONS[activeRole],
      loading,
      signIn,
      signOut,
      switchRole,
      canAccessView: (view: View) => canAccessView(activeRole, view),
      canTransitionStage: (fromSeq: number, toSeq: number) => isOperatorTransitionAllowed(activeRole, fromSeq, toSeq),
      canPerform: canPerformAction,
    };
  }, [user, session, profile, activeRole, loading, signIn, signOut, switchRole, canPerformAction]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
