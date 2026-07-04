'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, Minus, Plus, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/panel-auth';
import {
  getProducts,
  createProduct,
  updateProduct,
  adjustStock,
  deleteProduct,
  getDoctorsAdmin,
  PanelApiError,
  type ProductItem,
  type ProductCategory,
  type Doctor,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: 'MEDICATION', label: 'Medicamento' },
  { value: 'SUPPLY', label: 'Insumo' },
  { value: 'OTHER', label: 'Otro' },
];
const catLabel = (c: ProductCategory) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

type Draft = {
  id?: string;
  name: string;
  sku: string;
  category: ProductCategory;
  unit: string;
  price: string;
  stock: string;
  lowStockThreshold: string;
  doctorId: string; // '' = producto de la clínica
};
const empty: Draft = {
  name: '',
  sku: '',
  category: 'MEDICATION',
  unit: 'unidad',
  price: '',
  stock: '0',
  lowStockThreshold: '',
  doctorId: '',
};

export default function ProductsPage() {
  return (
    <PanelShell>
      <Products />
    </PanelShell>
  );
}

function isLow(p: ProductItem): boolean {
  return p.lowStockThreshold != null && p.stock <= p.lowStockThreshold;
}

function Products() {
  const { session } = useAuth();
  const isAdmin = session?.user.role === 'ADMIN';
  const [items, setItems] = useState<ProductItem[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  // Filtro del admin: '' = todos, 'clinic' = de la clínica, uuid = del doctor.
  const [ownerFilter, setOwnerFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setItems(await getProducts(session.token, session.slug, true, ownerFilter || undefined));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [session, ownerFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Doctores para el filtro/dueño (solo lo usa el admin).
  useEffect(() => {
    if (!session || !isAdmin) return;
    getDoctorsAdmin(session.token, session.slug)
      .then((d) => setDoctors(d.filter((doc) => doc.isActive)))
      .catch(() => {});
  }, [session, isAdmin]);

  const doctorName = (id: string | null) =>
    id ? (doctors.find((d) => d.id === id)?.name ?? 'Doctor') : null;

  async function save() {
    if (!session || !draft) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        category: draft.category,
        unit: draft.unit.trim() || 'unidad',
        price: Number(draft.price) || 0,
        stock: Number(draft.stock) || 0,
        lowStockThreshold: draft.lowStockThreshold === '' ? null : Number(draft.lowStockThreshold),
        doctorId: draft.doctorId || null,
      };
      if (draft.id) await updateProduct(session.token, session.slug, draft.id, body);
      else await createProduct(session.token, session.slug, body);
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo guardar el producto');
    } finally {
      setSaving(false);
    }
  }

  async function adjust(id: string, delta: number) {
    if (!session) return;
    // Optimista
    setItems((list) =>
      list.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
    );
    try {
      await adjustStock(session.token, session.slug, id, delta);
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo ajustar el stock');
      await load();
    }
  }

  async function remove(id: string) {
    if (!session) return;
    try {
      await deleteProduct(session.token, session.slug, id);
      await load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo archivar el producto');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Productos</h1>
          <p className="text-sm text-text-muted">Inventario de medicamentos, insumos y otros.</p>
        </div>
        {!draft && (
          <button
            onClick={() => setDraft({ ...empty })}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Nuevo producto
          </button>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      {/* Filtro por dueño (solo admin): clínica o un doctor específico */}
      {isAdmin && doctors.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm text-text-secondary">
          Ver productos de
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos</option>
            <option value="clinic">La clínica</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Formulario crear/editar */}
      {draft && (
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <Field label="Nombre">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Paracetamol 500mg"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as ProductCategory })
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unidad">
              <input
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="caja, unidad, ml…"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Precio (Bs)">
              <input
                type="number"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                min={0}
                step="0.01"
              />
            </Field>
            <Field label="Stock">
              <input
                type="number"
                value={draft.stock}
                onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                min={0}
              />
            </Field>
            <Field label="Alerta stock bajo">
              <input
                type="number"
                value={draft.lowStockThreshold}
                onChange={(e) => setDraft({ ...draft, lowStockThreshold: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                min={0}
                placeholder="—"
              />
            </Field>
            <Field label="SKU (opcional)">
              <input
                value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>
          {/* Dueño del producto (solo admin): clínica (todos lo ven) o privado
              de un doctor (solo él y el admin). */}
          {isAdmin && doctors.length > 0 && (
            <Field label="Pertenece a">
              <select
                value={draft.doctorId}
                onChange={(e) => setDraft({ ...draft, doctorId: e.target.value })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">La clínica (visible para todos)</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (privado)
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="px-4 py-2 text-sm text-text-muted">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !draft.name.trim()}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Aún no hay productos"
          description="Agrega medicamentos o insumos para controlar su stock y asignarlos a recetas."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-4 rounded-xl border bg-surface p-4 transition-all hover:shadow-sm ${
                p.isActive ? 'border-border' : 'border-border opacity-60'
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold text-text-primary">
                  <span className="truncate">{p.name}</span>
                  {isLow(p) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      <AlertTriangle className="size-3" /> Reponer
                    </span>
                  )}
                  {p.doctorId && doctorName(p.doctorId) && (
                    <span className="inline-flex items-center rounded-full border border-border bg-canvas px-2 py-0.5 text-[11px] text-text-secondary">
                      {doctorName(p.doctorId)}
                    </span>
                  )}
                  {!p.isActive && <span className="text-xs text-red-500">archivado</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
                  <span>{catLabel(p.category)}</span>
                  <span className="text-text-disabled">·</span>
                  <span className="font-medium text-text-primary">
                    Bs {Number(p.price).toFixed(2)}
                  </span>
                  <span className="text-text-disabled">·</span>
                  <span>/ {p.unit}</span>
                </p>
              </div>

              <div className="flex flex-shrink-0 items-center gap-3">
                {/* Ajuste de stock */}
                {/* Área táctil mínima 44px para uso en móvil/tablet. */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => adjust(p.id, -1)}
                    disabled={p.stock <= 0}
                    aria-label="Restar stock"
                    className="flex size-11 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-canvas disabled:opacity-30"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span
                    className={`w-10 text-center text-sm font-semibold tabular-nums ${
                      isLow(p) ? 'text-amber-600' : 'text-text-primary'
                    }`}
                  >
                    {p.stock}
                  </span>
                  <button
                    onClick={() => adjust(p.id, 1)}
                    aria-label="Sumar stock"
                    className="flex size-11 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-canvas"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>

                <div className="flex gap-3 text-sm">
                  <button
                    onClick={() =>
                      setDraft({
                        id: p.id,
                        name: p.name,
                        sku: p.sku ?? '',
                        category: p.category,
                        unit: p.unit,
                        price: String(p.price),
                        stock: String(p.stock),
                        lowStockThreshold:
                          p.lowStockThreshold == null ? '' : String(p.lowStockThreshold),
                        doctorId: p.doctorId ?? '',
                      })
                    }
                    className="font-medium text-brand-600 hover:text-brand-800"
                  >
                    Editar
                  </button>
                  {p.isActive && (
                    <button
                      onClick={() => remove(p.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Archivar
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
