// Notifications — bell badge + modal list + realtime
const Notifications = {
  items: [],
  channel: null,

  async init() {
    const btn = document.getElementById('notifications-btn');
    if (btn) btn.addEventListener('click', () => Notifications.openPanel());

    await Notifications.refresh();
    Notifications._subscribe();
  },

  async refresh() {
    const userId = App.profile?.id;
    if (!userId) {
      Notifications.items = [];
      Notifications._renderBadge();
      return;
    }
    const { data, error } = await sb.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('notifications load failed', error); return; }
    Notifications.items = data || [];
    Notifications._renderBadge();
  },

  _renderBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = Notifications.items.filter(n => !n.read_at).length;
    if (unread > 0) {
      badge.textContent = String(unread > 99 ? '99+' : unread);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  },

  _subscribe() {
    const userId = App.profile?.id;
    if (!userId || !sb.channel) return;
    if (Notifications.channel) { try { sb.removeChannel(Notifications.channel); } catch (e) {} }

    Notifications.channel = sb.channel(`notifications_${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          Notifications.items.unshift(payload.new);
          Notifications._renderBadge();
          toast(payload.new.title);
        })
      .subscribe();
  },

  openPanel() {
    const items = Notifications.items;
    const body = items.length === 0
      ? '<div class="empty-state-sm">No notifications yet</div>'
      : items.map(n => Notifications._renderItem(n)).join('');

    const unread = items.filter(n => !n.read_at).length;
    const markAllBtn = unread > 0
      ? '<button class="btn btn-ghost btn-sm" onclick="Notifications.markAllRead()">Mark all read</button>'
      : '';

    showModal(`
      <h3 class="modal-title">Notifications</h3>
      ${markAllBtn}
      <div class="notif-list">${body}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-block" onclick="hideModal()">Close</button>
      </div>
    `);

    document.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const n = Notifications.items.find(x => x.id === id);
        if (!n) return;
        Notifications.markRead(id);
        hideModal();
        if (n.link) Router.navigate(n.link);
      });
    });
  },

  _renderItem(n) {
    const unreadClass = n.read_at ? '' : 'notif-item-unread';
    const when = Notifications._ago(n.created_at);
    return `
      <div class="notif-item ${unreadClass}" data-id="${n.id}">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="notif-item-body">${escapeHtml(n.body)}</div>` : ''}
        <div class="notif-item-time">${when}</div>
      </div>
    `;
  },

  _ago(ts) {
    if (!ts) return '';
    const then = new Date(ts).getTime();
    const diff = Math.max(0, Date.now() - then);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  },

  async markRead(id) {
    const n = Notifications.items.find(x => x.id === id);
    if (!n || n.read_at) return;
    const now = new Date().toISOString();
    n.read_at = now;
    Notifications._renderBadge();
    await sb.from('notifications').update({ read_at: now }).eq('id', id);
  },

  async markAllRead() {
    const userId = App.profile?.id;
    if (!userId) return;
    const now = new Date().toISOString();
    Notifications.items.forEach(n => { if (!n.read_at) n.read_at = now; });
    Notifications._renderBadge();
    hideModal();
    await sb.from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null);
  },
};
