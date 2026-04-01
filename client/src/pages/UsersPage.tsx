import React, { useState } from 'react';
import { Plus, Search, Edit2, KeyRound, Power, Shield, UserCheck, UserX, Users, CheckCircle2, Ban } from 'lucide-react';
import {
  useUsers, useCreateUser, useUpdateUser,
  useChangePassword, useToggleActive,
  type UserPublic, type CreateUserInput, type UpdateUserInput,
} from '../api/users.ts';
import { useAuthStore } from '../store/authStore.ts';

// ==================== Theme helpers ====================

const surfaceCard: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-card)',
};

const subtleCard: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
};

const text = {
  heading: { color: 'var(--text-heading)' } as React.CSSProperties,
  body: { color: 'var(--text-body)' } as React.CSSProperties,
  secondary: { color: 'var(--text-secondary)' } as React.CSSProperties,
  muted: { color: 'var(--text-muted)' } as React.CSSProperties,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  color: 'var(--text-body)',
};

// ==================== Helpers ====================

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير عام',
  manager: 'مدير',
  cashier: 'كاشير',
  warehouse: 'مخزن',
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#7c3aed',
  manager: '#0369a1',
  cashier: '#059669',
  warehouse: '#b45309',
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// ==================== Modal ====================

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={surfaceCard}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="font-black text-base" style={text.heading}>
            {title}
          </h2>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition"
            style={{ ...subtleCard, color: 'var(--text-secondary)' }}
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function InputField({
  label, name, type = 'text', value, onChange, placeholder, required, disabled,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-black mb-1.5" style={text.secondary}>
        {label} {required && <span className="text-rose-500">*</span>}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-2xl px-4 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50"
        style={inputStyle}
      />
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-black mb-1.5" style={text.secondary}>
        الدور <span className="text-rose-500">*</span>
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-2xl px-4 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50"
        style={inputStyle}
      >
        <option value="cashier">كاشير</option>
        <option value="warehouse">مخزن</option>
        <option value="manager">مدير</option>
        <option value="admin">مدير عام</option>
      </select>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string | null }) {
  if (!msg) return null;

  return (
    <div
      className="rounded-2xl px-4 py-3 text-sm font-bold"
      style={{
        background: '#fee2e2',
        color: '#b91c1c',
        border: '1px solid #fecaca',
      }}
    >
      {msg}
    </div>
  );
}

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-3 text-white font-black rounded-2xl transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
      style={{ background: '#059669' }}
    >
      {loading ? 'جاري الحفظ...' : label}
    </button>
  );
}

// ==================== Create Modal ====================

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const createUser = useCreateUser();
  const [form, setForm] = useState<CreateUserInput>({
    username: '',
    password: '',
    full_name: '',
    role: 'cashier',
  });
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof CreateUserInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createUser.mutateAsync(form);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'حدث خطأ';
      setError(msg);
    }
  };

  return (
    <Modal title="إضافة مستخدم جديد" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="الاسم الكامل"
          name="full_name"
          value={form.full_name}
          onChange={set('full_name')}
          placeholder="مثال: أحمد محمد"
          required
        />

        <InputField
          label="اسم المستخدم"
          name="username"
          value={form.username}
          onChange={set('username')}
          placeholder="مثال: ahmed_m"
          required
        />

        <InputField
          label="كلمة المرور"
          name="password"
          type="password"
          value={form.password}
          onChange={set('password')}
          placeholder="6 أحرف على الأقل"
          required
        />

        <RoleSelect
          value={form.role}
          onChange={(v) => setForm((f) => ({ ...f, role: v as CreateUserInput['role'] }))}
        />

        <ErrorBanner msg={error} />
        <SubmitBtn loading={createUser.isPending} label="إنشاء المستخدم" />
      </form>
    </Modal>
  );
}

// ==================== Edit Modal ====================

function EditUserModal({ user, onClose }: { user: UserPublic; onClose: () => void }) {
  const updateUser = useUpdateUser();
  const [form, setForm] = useState<UpdateUserInput>({
    full_name: user.full_name,
    role: user.role as UpdateUserInput['role'],
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await updateUser.mutateAsync({ id: user.id, data: form });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'حدث خطأ';
      setError(msg);
    }
  };

  return (
    <Modal title={`تعديل: ${user.full_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="الاسم الكامل"
          name="full_name"
          value={form.full_name ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, full_name: v }))}
          required
        />

        <RoleSelect
          value={form.role ?? 'cashier'}
          onChange={(v) => setForm((f) => ({ ...f, role: v as UpdateUserInput['role'] }))}
          disabled={user.is_protected}
        />

        {user.is_protected && (
          <p
            className="text-xs font-medium rounded-2xl px-3 py-2"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
          >
            هذا المستخدم محمي — لا يمكن تغيير دوره
          </p>
        )}

        <ErrorBanner msg={error} />
        <SubmitBtn loading={updateUser.isPending} label="حفظ التعديلات" />
      </form>
    </Modal>
  );
}

// ==================== Password Modal ====================

function PasswordModal({ user, onClose }: { user: UserPublic; onClose: () => void }) {
  const changePassword = useChangePassword();
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPass !== confirm) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    if (newPass.length < 6) {
      setError('كلمة المرور 6 أحرف على الأقل');
      return;
    }

    try {
      await changePassword.mutateAsync({ id: user.id, newPassword: newPass });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'حدث خطأ';
      setError(msg);
    }
  };

  if (success) {
    return (
      <Modal title="تغيير كلمة المرور" onClose={onClose}>
        <div className="text-center py-4">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-black" style={text.body}>تم تغيير كلمة المرور</p>
          <p className="text-xs mt-1 font-medium" style={text.muted}>
            تم إلغاء جميع جلسات المستخدم
          </p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2.5 rounded-2xl font-black text-white text-sm"
            style={{ background: '#059669' }}
          >
            إغلاق
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`كلمة مرور: ${user.full_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="كلمة المرور الجديدة"
          name="newPass"
          type="password"
          value={newPass}
          onChange={setNewPass}
          placeholder="6 أحرف على الأقل"
          required
        />

        <InputField
          label="تأكيد كلمة المرور"
          name="confirm"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="أعد إدخال كلمة المرور"
          required
        />

        <ErrorBanner msg={error} />
        <SubmitBtn loading={changePassword.isPending} label="تغيير كلمة المرور" />
      </form>
    </Modal>
  );
}

// ==================== Main Page ====================

type ModalType = 'create' | 'edit' | 'password' | null;

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const { data: users = [], isLoading, error } = useUsers();
  const toggleActive = useToggleActive();

  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<UserPublic | null>(null);

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
  };

  const openEdit = (u: UserPublic) => { setSelectedUser(u); setModal('edit'); };
  const openPassword = (u: UserPublic) => { setSelectedUser(u); setModal('password'); };
  const closeModal = () => { setModal(null); setSelectedUser(null); };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div
        className="rounded-3xl px-5 py-4 md:px-6 md:py-5"
        style={{
          ...surfaceCard,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 94%, var(--bg-subtle)) 0%, var(--bg-card) 100%)',
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl md:text-[28px] font-black tracking-tight" style={text.heading}>
              إدارة المستخدمين
            </h1>
            <p className="text-sm font-semibold mt-1" style={text.secondary}>
              التحكم في حسابات وصلاحيات الموظفين
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={() => setModal('create')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-black text-sm rounded-2xl transition-all active:scale-95"
              style={{ background: '#059669' }}
            >
              <Plus size={16} />
              مستخدم جديد
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <StatsCard
          icon={<Users className="w-5 h-5" />}
          label="إجمالي المستخدمين"
          value={String(stats.total)}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
        />

        <StatsCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="نشط"
          value={String(stats.active)}
          iconBg="#d1fae5"
          iconColor="#065f46"
        />

        <StatsCard
          icon={<Ban className="w-5 h-5" />}
          label="معطّل"
          value={String(stats.inactive)}
          iconBg="#fee2e2"
          iconColor="#991b1b"
        />
      </div>

      {/* Search */}
      <div className="rounded-3xl p-4 md:p-5" style={surfaceCard}>
        <div className="relative">
          <Search
            size={15}
            className="absolute right-4 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو اسم المستخدم..."
            className="w-full rounded-2xl pr-10 pl-4 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-3xl overflow-hidden" style={surfaceCard}>
        {isLoading && (
          <div className="p-12 text-center text-sm font-medium" style={text.muted}>
            جاري التحميل...
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-sm font-medium" style={{ color: '#e11d48' }}>
            خطأ في تحميل البيانات — تحقق من الصلاحيات
          </div>
        )}

        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr
                  className="text-right border-b"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}
                >
                  {['المستخدم', 'الدور', 'الحالة', 'آخر دخول', 'تاريخ الإنشاء', 'إجراءات'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-xs font-black"
                      style={text.secondary}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-sm font-medium"
                      style={text.muted}
                    >
                      {search ? 'لا توجد نتائج للبحث' : 'لا يوجد مستخدمون'}
                    </td>
                  </tr>
                )}

                {filtered.map((u, idx) => (
                  <tr
                    key={u.id}
                    className="transition-colors"
                    style={{
                      borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                      background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-subtle)',
                    }}
                  >
                    {/* User Info */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                          style={{ background: ROLE_COLORS[u.role] ?? '#64748b' }}
                        >
                          {u.full_name[0]}
                        </div>

                        <div>
                          <div className="font-black text-sm flex items-center gap-1.5" style={text.body}>
                            {u.full_name}
                            {u.is_protected && (
                              <Shield size={12} className="text-amber-500" aria-label="محمي" />
                            )}
                          </div>
                          <div className="text-xs font-medium" style={text.muted}>
                            @{u.username}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-5 py-4">
                      <span
                        className="text-xs font-black px-2.5 py-1 rounded-xl"
                        style={{
                          background: `${ROLE_COLORS[u.role]}18`,
                          color: ROLE_COLORS[u.role],
                        }}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      {u.is_active ? (
                        <span className="flex items-center gap-1.5 text-xs font-black text-emerald-600">
                          <UserCheck size={13} />
                          نشط
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-black" style={text.muted}>
                          <UserX size={13} />
                          معطّل
                        </span>
                      )}
                    </td>

                    {/* Last Login */}
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium" style={text.secondary}>
                        {fmt(u.last_login_at)}
                      </span>
                    </td>

                    {/* Created At */}
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium" style={text.muted}>
                        {fmt(u.created_at)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      {isAdmin ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            title="تعديل"
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                            style={{ color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)' }}
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            onClick={() => openPassword(u)}
                            title="تغيير كلمة المرور"
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                            style={{ color: '#7c3aed', background: 'rgba(124, 58, 237, 0.08)' }}
                          >
                            <KeyRound size={14} />
                          </button>

                          {!u.is_protected && String(u.id) !== String(currentUser?.id) && (
                            <button
                              onClick={() => toggleActive.mutate(u.id)}
                              title={u.is_active ? 'تعطيل' : 'تفعيل'}
                              disabled={toggleActive.isPending}
                              className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                              style={
                                u.is_active
                                  ? { color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)' }
                                  : { color: '#059669', background: 'rgba(5, 150, 105, 0.08)' }
                              }
                            >
                              <Power size={14} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-medium" style={text.muted}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'create' && <CreateUserModal onClose={closeModal} />}
      {modal === 'edit' && selectedUser && <EditUserModal user={selectedUser} onClose={closeModal} />}
      {modal === 'password' && selectedUser && <PasswordModal user={selectedUser} onClose={closeModal} />}
    </div>
  );
}

function StatsCard({
  icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div
      className="rounded-3xl p-4 md:p-5 transition-transform duration-200 hover:-translate-y-[1px]"
      style={surfaceCard}
    >
      <div
        className="inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-4 flex-shrink-0"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>

      <p className="text-[13px] font-semibold mb-1" style={text.secondary}>
        {label}
      </p>

      <p className="text-2xl font-black tracking-tight" style={text.heading}>
        {value}
      </p>
    </div>
  );
}