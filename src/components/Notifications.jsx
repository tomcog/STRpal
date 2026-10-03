import { useCallback, useEffect, useState } from 'react';
import { Button, ButtonRound } from '@tomcoggia/ui';
import { Bell } from 'lucide-react';
import { sb } from '../lib/supabase.js';
import { timeAgo } from '../lib/format.js';
import { useApp } from '../app/AppContext.jsx';
import { Sheet } from './Sheet.jsx';
import { toast } from './Toast.jsx';
import './Notifications.css';

// Bell + unread badge in the header, the list in a sheet, realtime inserts.
export function NotificationsButton() {
  const { profile } = useApp();
  const userId = profile?.id;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) { setItems([]); return; }
    const { data, error } = await sb.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('notifications load failed', error); return; }
    setItems(data || []);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = sb.channel(`notifications_${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setItems(prev => [payload.new, ...prev]);
          toast(payload.new.title);
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId]);

  const unread = items.filter(n => !n.read_at).length;

  const markRead = async (n) => {
    if (n.read_at) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read_at: now } : x)));
    await sb.from('notifications').update({ read_at: now }).eq('id', n.id);
  };

  const markAllRead = async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(x => (x.read_at ? x : { ...x, read_at: now })));
    setOpen(false);
    await sb.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null);
  };

  const openItem = (n) => {
    markRead(n);
    setOpen(false);
    if (n.link) location.hash = n.link;
  };

  return (
    <>
      <span className="notif-anchor">
        <ButtonRound variant="tertiary" size="lg" icon={<Bell />}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          onClick={() => setOpen(true)} />
        {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </span>

      <Sheet
        open={open}
        title="Notifications"
        onClose={() => setOpen(false)}
        actions={unread > 0 && <Button variant="secondary" size="lg" onClick={markAllRead}>Mark all read</Button>}
      >
        {items.length === 0 ? (
          <div className="empty-state">No notifications yet</div>
        ) : (
          <div className="notif-list">
            {items.map(n => (
              <button key={n.id} type="button" className={`notif-item${n.read_at ? '' : ' unread'}`} onClick={() => openItem(n)}>
                <span className="notif-item-title">{n.title}</span>
                {n.body && <span className="notif-item-body">{n.body}</span>}
                <span className="notif-item-time">{timeAgo(n.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
