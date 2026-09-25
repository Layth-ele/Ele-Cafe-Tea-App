import { Link, Outlet, useLocation } from 'react-router';
import {
  ArrowLeft, BarChart2, Boxes, ChevronRight, Eye, KeyRound, LayoutDashboard, MailCheck,
  Package, Settings, ShoppingBag, Tag, Users,
} from 'lucide-react';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { ROUTES } from '@/lib/routes';

const NAV = [
  { path: ROUTES.ADMIN,            icon: LayoutDashboard, label: 'Overview',   sub: 'Stats & activity'    },
  { path: ROUTES.ADMIN_ANALYTICS,  icon: BarChart2,       label: 'Analytics',  sub: 'Revenue & insights'  },
  { path: ROUTES.ADMIN_PRODUCTS,   icon: Package,         label: 'Products',   sub: 'Teas catalog'        },
  { path: ROUTES.ADMIN_INVENTORY,  icon: Boxes,           label: 'Inventory',  sub: 'Container levels'    },
  { path: ROUTES.ADMIN_EMPLOYEES,  icon: KeyRound,        label: 'Employees',  sub: 'Inventory access'    },
  { path: ROUTES.ADMIN_ORDERS,     icon: ShoppingBag,     label: 'Orders',     sub: 'Manage & fulfil'     },
  { path: ROUTES.ADMIN_CUSTOMERS,  icon: Users,           label: 'Customers',  sub: 'Accounts & credits'  },
  { path: ROUTES.ADMIN_PROMOTIONS, icon: Tag,             label: 'Promotions', sub: 'Discount codes'      },
  // Verification + visits analytics — kept separate from main
  // Analytics so admin can find each quickly when investigating its
  // specific signal. Sub-text matches the admin task at hand.
  { path: ROUTES.ADMIN_VERIFICATION_ANALYTICS, icon: MailCheck, label: 'Verification', sub: 'Email verify funnel' },
  { path: ROUTES.ADMIN_VISITS_ANALYTICS,       icon: Eye,       label: 'Visits',       sub: 'Customer page views' },
  { path: ROUTES.ADMIN_SETTINGS,   icon: Settings,        label: 'Settings',   sub: 'Store configuration' },
];

function AdminLayout() {
  const location = useLocation();
  const isActive = (path: string) =>
    path === ROUTES.ADMIN
      ? location.pathname === ROUTES.ADMIN
      : location.pathname.startsWith(path);

  return (
    <>
      <SeoHead title="Admin Dashboard | Ele Café" description="Ele Café admin panel." noIndex />

      <div className="adm-shell" data-density="dense">

        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside className="adm-sidebar">
          {/* Brand */}
          <div className="adm-logo-bar">
            <p className="adm-brand">Ele Café</p>
            <p className="adm-sub">Admin Panel</p>
          </div>

          {/* Nav */}
          <nav className="adm-nav" aria-label="Admin navigation">
            <p className="adm-section-label">Navigation</p>
            {NAV.map(({ path, icon: Icon, label, sub }) => {
              const active = isActive(path);
              return (
                <Link key={path} to={path}
                  className={`adm-item${active ? ' active' : ''}`}>
                  <div className="adm-icon-wrap" data-active={active ? 'true' : 'false'}>
                    <Icon size={14} className="adm-icon" data-active={active ? 'true' : 'false'} />
                  </div>
                  <div className="adm-item-text">
                    <p className="adm-item-label">{label}</p>
                    <p className="adm-item-sub">{sub}</p>
                  </div>
                  {active && <ChevronRight size={11} className="adm-item-chevron" />}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="adm-footer">
            <Link to={ROUTES.HOME} className="adm-back-link">
              <ArrowLeft size={11} /> Back to Store
            </Link>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────── */}
        <div className="adm-main-col">

          {/* Mobile tab bar */}
          <div className="adm-mobile-tabs">
            {NAV.map(({ path, icon: Icon, label }) => {
              const active = isActive(path);
              return (
                <Link key={path} to={path} className={`adm-mobile-tab${active ? ' active' : ''}`}>
                  <Icon size={11} />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Content */}
          <main className="adm-main">
            <AdminBreadcrumbs />
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

/**
 * Auto-derived admin breadcrumb. Reads the current path, finds the
 * matching NAV entry, and renders [Home › Admin › {Section}]. For
 * detail routes (/admin/orders/:id), this stays 3-deep — the
 * AdminLayout doesn't know the entity name so per-detail-page
 * components can render their own deeper breadcrumb if needed.
 *
 * Path-matching uses startsWith so /admin/orders/abc123 matches the
 * /admin/orders entry. The /admin overview path is excluded from
 * the match candidate list because it's a prefix of every other
 * admin path; we want it to appear as the second crumb, not the
 * tail.
 */
function AdminBreadcrumbs() {
  const location = useLocation();
  const sections = NAV.filter(s => s.path !== ROUTES.ADMIN);
  const match = sections.find(s => location.pathname.startsWith(s.path));
  const items = [
    { name: 'Home',  url: ROUTES.HOME },
    { name: 'Admin', url: ROUTES.ADMIN },
    ...(match ? [{ name: match.label, url: match.path }] : []),
  ];
  return <Breadcrumbs items={items} />;
}

export { AdminLayout };
export default AdminLayout;
