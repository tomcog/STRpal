import { BottomNav, BottomNavItem, ButtonRound, LeftRail, NavRail, NavSlat } from '@tomcoggia/ui';
import { CalendarDays, LayoutGrid, Package, Send, User, Users } from 'lucide-react';
import { TITLES, navigate, useRoute } from '../lib/router.js';
import { Toaster } from '../components/Toast.jsx';
import { ConfirmHost } from '../components/ConfirmDialog.jsx';
import { ImageViewerHost } from '../components/ImageViewer.jsx';
import { NotificationsButton } from '../components/Notifications.jsx';
import { ViewBoundary } from '../components/ViewBoundary.jsx';
import Feed from '../views/Feed.jsx';
import TaskDetail from '../views/TaskDetail.jsx';
import Payments from '../views/Payments.jsx';
import Calendar from '../views/Calendar.jsx';
import Inventory from '../views/Inventory.jsx';
import Admin from '../views/Admin.jsx';
import Profile from '../views/Profile.jsx';
import Sms from '../views/Sms.jsx';

const SECTIONS = [
  { view: 'feed', label: 'Tasks', icon: LayoutGrid },
  { view: 'report', label: 'Payments', icon: Send },
  { view: 'calendar', label: 'Stayzzz', icon: CalendarDays },
  { view: 'inventory', label: 'Inventory', icon: Package },
  { view: 'admin', label: 'Admin', icon: Users },
];

// Pages reached from inside a section keep that section lit in the nav
const SECTION_OF = { 'task-detail': 'feed', sms: 'profile' };

function renderView({ view, param }) {
  switch (view) {
    case 'feed': return <Feed />;
    case 'task-detail': return param ? <TaskDetail key={param} taskId={param} /> : <Feed />;
    case 'report': return <Payments mode={param} />;
    case 'calendar': return <Calendar />;
    case 'inventory': return <Inventory />;
    case 'admin': return <Admin />;
    case 'profile': return <Profile />;
    case 'sms': return <Sms />;
    default: return <Feed />;
  }
}

export default function App() {
  const route = useRoute();
  const section = SECTION_OF[route.view] || route.view;

  return (
    <div className="app-shell">
      <LeftRail
        className="app-rail"
        brand={
          <a className="rail-brand" href="#feed">
            <img src="/icons/icon-192.svg" alt="" />
            <span>STRpal</span>
          </a>
        }
      >
        <NavRail aria-label="Sections">
          {SECTIONS.map(({ view, label, icon: Icon }) => (
            <NavSlat key={view} href={`#${view}`} icon={<Icon />} active={section === view}>
              {label}
            </NavSlat>
          ))}
          <NavSlat href="#profile" icon={<User />} active={section === 'profile'}>
            Profile
          </NavSlat>
        </NavRail>
      </LeftRail>

      <div className="app-main">
        <header className="app-header">
          <h1 className="app-header-title">{TITLES[route.view] || 'STRpal'}</h1>
          <div className="app-header-actions">
            <NotificationsButton />
            <ButtonRound variant="tertiary" size="lg" icon={<User />} aria-label="Profile"
              onClick={() => navigate('profile')} />
          </div>
        </header>

        <main className="app-content" id="main-content">
          <ViewBoundary key={route.view}>{renderView(route)}</ViewBoundary>
        </main>
      </div>

      <div className="app-bottom-nav">
        <BottomNav aria-label="Sections">
          {SECTIONS.map(({ view, label, icon: Icon }) => (
            <BottomNavItem key={view} href={`#${view}`} icon={<Icon />} current={section === view}>
              {label}
            </BottomNavItem>
          ))}
        </BottomNav>
      </div>

      <Toaster />
      <ConfirmHost />
      <ImageViewerHost />
    </div>
  );
}
