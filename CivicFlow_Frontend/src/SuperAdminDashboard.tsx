import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Crown,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from './api/client';
import type { User as ApiUser, UserRole } from './api/types';
import { useAuth } from './auth/AuthContext';
import './SuperAdminDashboard.css';

const DEPARTMENTS = [
  'Citywide / None',
  'Roads & Infrastructure',
  'Waste Management',
  'Street Lighting',
  'Drainage',
  'Water Supply',
  'Parks & Public Spaces',
  'Public Safety',
];

export default function SuperAdminDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State for Elevation / Revocation
  const [targetEmail, setTargetEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [selectedDept, setSelectedDept] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const loadUsersList = useCallback(async (isQuiet = false) => {
    if (isQuiet) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch (err) {
      const apiErr = err as ApiError;
      setNotice({
        type: 'error',
        text: apiErr.message || 'Could not load users directory from API.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsersList();
  }, [loadUsersList]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = users.length;
    let superadmins = 0;
    let admins = 0;
    let officers = 0;
    let citizens = 0;
    let inactive = 0;

    users.forEach((u) => {
      if (u.role === 'superadmin') superadmins++;
      else if (u.role === 'admin') admins++;
      else if (u.role === 'officer') officers++;
      else citizens++;

      if (!u.is_active) inactive++;
    });

    return { total, superadmins, admins, officers, citizens, inactive };
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !searchQuery.trim() ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesRole = roleFilter === 'all' || u.role === roleFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? u.is_active : !u.is_active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Handle Role Assignment
  const handleAssignPrivilege = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = targetEmail.trim().toLowerCase();
    if (!email) return;

    setFormSaving(true);
    setNotice(null);

    try {
      const deptValue = selectedDept && selectedDept !== 'Citywide / None' ? selectedDept : null;
      const updated = await api.updateUserPrivilege({
        email,
        role: selectedRole,
        department: selectedRole === 'citizen' ? null : deptValue,
      });

      setNotice({
        type: 'success',
        text: `Permissions updated: ${updated.email} is now assigned as "${updated.role.toUpperCase()}"${
          updated.department ? ` (${updated.department})` : ''
        }.`,
      });

      setTargetEmail('');
      await loadUsersList(true);
    } catch (err) {
      const apiErr = err as ApiError;
      setNotice({
        type: 'error',
        text: apiErr.message || 'Failed to update user privileges.',
      });
    } finally {
      setFormSaving(false);
    }
  };

  // Handle Quick Role Change from Table
  const handleQuickRoleChange = async (targetUser: ApiUser, newRole: UserRole) => {
    if (targetUser.id === user?.id && newRole !== 'admin' && newRole !== 'superadmin') {
      setNotice({
        type: 'error',
        text: 'Self-revocation blocked: You cannot revoke your own administrative privileges.',
      });
      return;
    }

    setNotice(null);
    try {
      await api.updateUserPrivilege({
        email: targetUser.email,
        role: newRole,
        department: newRole === 'citizen' ? null : targetUser.department,
      });

      setNotice({
        type: 'success',
        text: `Privilege updated: ${targetUser.email} is now ${newRole.toUpperCase()}.`,
      });

      await loadUsersList(true);
    } catch (err) {
      const apiErr = err as ApiError;
      setNotice({
        type: 'error',
        text: apiErr.message || 'Could not change user privilege.',
      });
    }
  };

  // Handle Toggle Active/Suspended
  const handleToggleActive = async (targetUser: ApiUser) => {
    if (targetUser.id === user?.id) {
      setNotice({
        type: 'error',
        text: 'Self-deactivation blocked: You cannot suspend your own account.',
      });
      return;
    }

    const nextState = !targetUser.is_active;
    setNotice(null);

    try {
      await api.setUserActive(targetUser.id, nextState);
      setNotice({
        type: 'success',
        text: `Account for ${targetUser.email} has been ${nextState ? 'REACTIVATED' : 'SUSPENDED'}.`,
      });
      await loadUsersList(true);
    } catch (err) {
      const apiErr = err as ApiError;
      setNotice({
        type: 'error',
        text: apiErr.message || 'Could not update user account status.',
      });
    }
  };

  const userInitial = user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'S';

  return (
    <div className="cf-superadmin-container">
      {/* Top Navigation Bar */}
      <header className="cf-superadmin-topbar">
        <div className="cf-superadmin-brand">
          <div className="cf-superadmin-logo-badge">
            <Crown size={16} />
            <span>SUPERADMIN</span>
          </div>
          <div className="cf-superadmin-title-group">
            <h1>CivicFlow Executive Authority</h1>
            <span>High-Privilege Access Governance & Role Management</span>
          </div>
        </div>

        <div className="cf-superadmin-topbar-actions">
          <div className="cf-superadmin-user-pill">
            <div className="cf-superadmin-user-avatar">{userInitial}</div>
            <span>{user?.email}</span>
            <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 700 }}>
              [{user?.role?.toUpperCase()}]
            </span>
          </div>
          <button
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="cf-superadmin-nav-btn"
            title="Sign out"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="cf-superadmin-body">
        {/* Notice Banner */}
        {notice && (
          <div className={`cf-superadmin-notice-bar ${notice.type}`}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {notice.type === 'success' ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
              {notice.text}
            </span>
            <button
              onClick={() => setNotice(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Header Block */}
        <div className="cf-superadmin-header">
          <div>
            <h2>Access Control & Privilege Governance</h2>
            <p>
              Grant, elevate, or revoke administrative authority across all municipal staff and citizen accounts.
              All modifications are cryptographically audited on the immutable ledger.
            </p>
          </div>
          <div>
            <button
              className="cf-superadmin-nav-btn"
              onClick={() => void loadUsersList(true)}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'cfadmin-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh Roster'}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <section className="cf-superadmin-stats-grid">
          <div className="cf-superadmin-stat-card">
            <div className="cf-superadmin-stat-icon purple">
              <Users size={22} />
            </div>
            <div className="cf-superadmin-stat-info">
              <b>{loading ? '—' : stats.total}</b>
              <span>Total Accounts</span>
            </div>
          </div>

          <div className="cf-superadmin-stat-card">
            <div className="cf-superadmin-stat-icon purple">
              <Crown size={22} />
            </div>
            <div className="cf-superadmin-stat-info">
              <b>{loading ? '—' : stats.superadmins + stats.admins}</b>
              <span>Superadmins & Admins</span>
            </div>
          </div>

          <div className="cf-superadmin-stat-card">
            <div className="cf-superadmin-stat-icon blue">
              <ShieldCheck size={22} />
            </div>
            <div className="cf-superadmin-stat-info">
              <b>{loading ? '—' : stats.officers}</b>
              <span>Operations Officers</span>
            </div>
          </div>

          <div className="cf-superadmin-stat-card">
            <div className="cf-superadmin-stat-icon green">
              <UserCheck size={22} />
            </div>
            <div className="cf-superadmin-stat-info">
              <b>{loading ? '—' : stats.citizens}</b>
              <span>Citizens</span>
            </div>
          </div>

          <div className="cf-superadmin-stat-card">
            <div className="cf-superadmin-stat-icon red">
              <XCircle size={22} />
            </div>
            <div className="cf-superadmin-stat-info">
              <b>{loading ? '—' : stats.inactive}</b>
              <span>Suspended Accounts</span>
            </div>
          </div>
        </section>

        {/* Elevation / Revocation Action Panel */}
        <section className="cf-superadmin-action-panel">
          <h3>
            <KeyRound size={18} color="#a78bfa" /> Assign or Revoke Privilege by Email
          </h3>
          <p className="sub">
            Lookup any registered email to grant Superadmin, Admin, or Officer authority, or revoke their permissions back to standard Citizen.
          </p>

          <form onSubmit={handleAssignPrivilege} className="cf-superadmin-form-row">
            <div className="cf-superadmin-field">
              <label htmlFor="sa-email">User Email Address</label>
              <input
                id="sa-email"
                type="email"
                required
                placeholder="e.g. administrator@chandigarh.gov.in"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
              />
            </div>

            <div className="cf-superadmin-field">
              <label htmlFor="sa-role">Assign Privilege Level</label>
              <select
                id="sa-role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              >
                <option value="superadmin">Superadmin (Executive Control)</option>
                <option value="admin">Administrator (Operations & Complaints)</option>
                <option value="officer">Operations Officer (Field Triage)</option>
                <option value="citizen">Citizen (Revoke All Admin Rights)</option>
              </select>
            </div>

            <div className="cf-superadmin-field">
              <label htmlFor="sa-dept">Assigned Department</label>
              <select
                id="sa-dept"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                disabled={selectedRole === 'citizen'}
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="cf-superadmin-btn"
              disabled={formSaving || !targetEmail.trim()}
            >
              {formSaving ? (
                <RefreshCw size={15} className="cfadmin-spin" />
              ) : selectedRole === 'citizen' ? (
                <UserMinus size={15} />
              ) : (
                <Shield size={15} />
              )}
              {formSaving
                ? 'Updating…'
                : selectedRole === 'citizen'
                ? 'Revoke Privilege'
                : 'Grant Privilege'}
            </button>
          </form>
        </section>

        {/* User Directory Table Card */}
        <section className="cf-superadmin-directory-card">
          <div className="cf-superadmin-directory-head">
            <h3>
              <Users size={18} color="#58a6ff" /> System User Directory ({filteredUsers.length})
            </h3>

            <div className="cf-superadmin-filter-bar">
              <div className="cf-superadmin-search-input">
                <Search size={14} color="#8b949e" />
                <input
                  type="text"
                  placeholder="Search name, email, department…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="cf-superadmin-role-pills">
                {['all', 'superadmin', 'admin', 'officer', 'citizen'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`cf-superadmin-pill-btn ${roleFilter === r ? 'active' : ''}`}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                style={{
                  background: '#21262d',
                  border: '1px solid #30363d',
                  color: '#c9d1d9',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Suspended Only</option>
              </select>
            </div>
          </div>

          <div className="cf-superadmin-table-wrap">
            <table className="cf-superadmin-table">
              <thead>
                <tr>
                  <th>User Identity</th>
                  <th>Assigned Privilege</th>
                  <th>Department</th>
                  <th>Account Status</th>
                  <th>Created</th>
                  <th>Governance Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#8b949e' }}>
                      <RefreshCw size={20} className="cfadmin-spin" style={{ display: 'inline-block', marginBottom: '8px' }} />
                      <div>Loading system users from API…</div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#8b949e' }}>
                      No user accounts match your search filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === user?.id;
                    const initial = u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U';

                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="cf-superadmin-user-cell">
                            <div className={`cf-superadmin-cell-avatar ${u.role}`}>
                              {initial}
                            </div>
                            <div>
                              <span className="cf-superadmin-user-name">
                                {u.full_name} {isSelf && <small style={{ color: '#a78bfa' }}>(You)</small>}
                              </span>
                              <span className="cf-superadmin-user-email">{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`cf-superadmin-badge ${u.role}`}>
                            {u.role === 'superadmin' && <Crown size={12} />}
                            {u.role === 'admin' && <Shield size={12} />}
                            {u.role === 'officer' && <Activity size={12} />}
                            {u.role === 'citizen' && <UserCheck size={12} />}
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '12px', color: u.department ? '#c9d1d9' : '#6e7681' }}>
                            {u.department || '—'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              className={`cf-superadmin-status-dot ${u.is_active ? 'active' : 'revoked'}`}
                            />
                            <span style={{ fontSize: '12px', color: u.is_active ? '#4ade80' : '#f87171' }}>
                              {u.is_active ? 'Active' : 'Suspended'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', color: '#8b949e' }}>
                            {new Date(u.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </td>
                        <td>
                          <div className="cf-superadmin-action-btns">
                            {/* Role Quick Switches */}
                            {u.role === 'citizen' ? (
                              <button
                                type="button"
                                className="cf-superadmin-table-btn elevate"
                                onClick={() => void handleQuickRoleChange(u, 'admin')}
                                title="Promote this citizen to Administrator"
                              >
                                <Shield size={12} /> Make Admin
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="cf-superadmin-table-btn revoke"
                                disabled={isSelf}
                                onClick={() => void handleQuickRoleChange(u, 'citizen')}
                                title="Revoke all administrative access and demote to Citizen"
                              >
                                <UserMinus size={12} /> Revoke
                              </button>
                            )}

                            {u.role === 'admin' && (
                              <button
                                type="button"
                                className="cf-superadmin-table-btn elevate"
                                onClick={() => void handleQuickRoleChange(u, 'superadmin')}
                                title="Promote to Superadmin"
                              >
                                <Crown size={12} /> Superadmin
                              </button>
                            )}

                            {/* Active / Suspend Account */}
                            <button
                              type="button"
                              className={`cf-superadmin-table-btn ${u.is_active ? 'revoke' : 'elevate'}`}
                              disabled={isSelf}
                              onClick={() => void handleToggleActive(u)}
                              title={u.is_active ? 'Suspend account login' : 'Reactivate account login'}
                            >
                              {u.is_active ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                              {u.is_active ? 'Suspend' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Governance & Audit Footer */}
        <div className="cf-superadmin-governance-footer">
          <ShieldCheck size={24} />
          <div>
            <strong style={{ color: '#f0f6fc', display: 'block', marginBottom: '2px' }}>
              Cryptographic Audit Protocol Active
            </strong>
            All role assignments, permission elevations, and account revocations are stamped with unique audit IDs,
            tracking administrator identity, client IP, and UTC timestamps for compliance.
          </div>
        </div>
      </main>
    </div>
  );
}
