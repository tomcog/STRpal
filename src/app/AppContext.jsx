import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase.js';

// There is no real auth right now: the first row in `users` is the active
// profile, with every permission forced on. Views gate through can() / isAdmin()
// so re-enabling auth stays a change to this one file.
const FULL_ACCESS = {
  is_admin: true,
  can_view_calendar: true,
  can_manage_finances: true,
  can_assign_tasks: true,
};

const DEFAULT_PROFILE = { id: null, name: 'Admin', ...FULL_ACCESS };

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [usersLoaded, setUsersLoaded] = useState(false);

  const refreshUsers = useCallback(async () => {
    const { data, error } = await sb.from('users').select('*');
    if (error) { console.error('users load failed', error); return []; }
    setUsers(data || []);
    return data || [];
  }, []);

  useEffect(() => {
    refreshUsers().then((list) => {
      if (list.length > 0) setProfile({ ...list[0], ...FULL_ACCESS });
      setUsersLoaded(true);
    });
  }, [refreshUsers]);

  const value = useMemo(() => ({
    profile,
    users,
    usersLoaded,
    setUsers,
    refreshUsers,
    // Merge saved fields into the active profile (permissions stay forced on)
    updateProfile: (updates) => setProfile(p => ({ ...p, ...updates, ...FULL_ACCESS })),
    can: (permission) => !!profile?.[permission],
    isAdmin: () => !!profile?.is_admin,
  }), [profile, users, usersLoaded, refreshUsers]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
