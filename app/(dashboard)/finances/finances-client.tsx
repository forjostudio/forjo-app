'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays, eachDayOfInterval } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Appointment, ManualSale, Expense, SavedProduct, Client, FixedExpense } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import {
  TrendingUp, TrendingDown, Plus, Pencil, Trash2,
  ChevronDown, Search, UserPlus, User, X, Receipt, Percent, Award, Activity, Power,
  Calendar, ShoppingBag,
} from 'lucide-react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

type Period = 'this_month' | 'last_month' | 'custom'
type ClientMode = 'none' | 'search' | 'new'
const EXPENSE_CATEGORIES = ['Insumos', 'Alquiler', 'Servicios', 'Personal', 'Marketing', 'Impuestos', 'Otro']
function fmtARS(n: number) { return '$' + Math.round(Number(n)).toLocaleString('es-AR') }

// ── Gastos fijos: frecuencias y su equivalente mensual ────────────────────────
// Todo gasto fijo se normaliza a un monto mensual para impactar el dashboard.
const FIXED_FREQUENCIES: { value: string; label: string; toMonthly: number }[] = [
  { value: 'monthly', label: 'Mensual', toMonthly: 1 },
  { value: 'biweekly', label: 'Quincenal', toMonthly: 2 },
  { value: 'weekly', label: 'Semanal', toMonthly: 52 / 12 },
  { value: 'bimonthly', label: 'Bimestral', toMonthly: 1 / 2 },
  { value: 'quarterly', label: 'Trimestral', toMonthly: 1 / 3 },
  { value: 'yearly', label: 'Anual', toMonthly: 1 / 12 },
]
const FIXED_FREQ_LABEL: Record<string, string> = Object.fromEntries(FIXED_FREQUENCIES.map(f => [f.value, f.label]))
const FIXED_PRESETS = ['Alquiler', 'Luz', 'Gas', 'Internet', 'Celular']
function monthlyEquivalent(amount: number, frequency: string): number {
  const f = FIXED_FREQUENCIES.find(x => x.value === frequency)
  return amount * (f ? f.toMonthly : 1)
}

// ── ProductCombobox ──────────────────────────────────────────────────────────
// Muestra el listado solo al escribir (≥1 char) o al clickear la flecha.
function ProductCombobox({ value, onChange, products, placeholder }: {
  value: string
  onChange: (v: string) => void
  products: SavedProduct[]
  placeholder?: string
}) {
  const [browse, setBrowse] = useState(false)

  const showList = browse || value.trim().length > 0
  const matches = showList
    ? (value.trim()
      ? products.filter(p => p.name.toLowerCase().includes(value.toLowerCase()))
      : products)
    : []

  function handleChange(v: string) {
    onChange(v)
    if (v.trim().length === 0) setBrowse(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setTimeout(() => setBrowse(false), 150)}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-8"
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setBrowse(v => !v)}
          tabIndex={-1}
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${browse && value.trim() === '' ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {showList && matches.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-y-auto max-h-48">
          {matches.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(p.name); setBrowse(false) }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props { businessId: string }

export function FinancesClient({ businessId }: Props) {
  const supabase = createClient()

  const [period, setPeriod] = useState<Period>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [loading, setLoading] = useState(true)

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [sales, setSales] = useState<ManualSale[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([])
  const [chartData, setChartData] = useState<{ name: string; ingresos: number; egresos: number }[]>([])

  // Fixed expense modal
  const [fixedModal, setFixedModal] = useState(false)
  const [editFixed, setEditFixed] = useState<FixedExpense | null>(null)
  const [fixedForm, setFixedForm] = useState({ name: '', amount: '', frequency: 'monthly', due_day: '' })
  const [savingFixed, setSavingFixed] = useState(false)
  const [confirmDeleteFixed, setConfirmDeleteFixed] = useState<string | null>(null)

  // Derived product lists filtered by type
  const incomeProducts = savedProducts.filter(p => p.type !== 'expense')
  const expenseProducts = savedProducts.filter(p => p.type === 'expense')

  // Sale modal
  const [saleModal, setSaleModal] = useState(false)
  const [editSale, setEditSale] = useState<ManualSale | null>(null)
  const [saleForm, setSaleForm] = useState({ description: '', quantity: '1', amount: '', date: format(new Date(), 'yyyy-MM-dd'), type: 'venta' })
  const [savingSale, setSavingSale] = useState(false)
  const [askSaveSale, setAskSaveSale] = useState(false)

  // Sale client association
  const [saleClientMode, setSaleClientMode] = useState<ClientMode>('none')
  const [saleClientSearch, setSaleClientSearch] = useState('')
  const [saleClientSelected, setSaleClientSelected] = useState<Client | null>(null)
  const [saleNewClient, setSaleNewClient] = useState({ name: '', phone: '', email: '' })

  // Expense modal
  const [expenseModal, setExpenseModal] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [expenseForm, setExpenseForm] = useState({ category: 'Insumos', concepto: '', amount: '', date: format(new Date(), 'yyyy-MM-dd') })
  const [savingExpense, setSavingExpense] = useState(false)
  const [askSaveExpense, setAskSaveExpense] = useState(false)

  // Pending product to save (shared between modals)
  const [pendingProductName, setPendingProductName] = useState('')
  const [pendingProductType, setPendingProductType] = useState<'income' | 'expense'>('income')

  // Delete confirms
  const [confirmDeleteSale, setConfirmDeleteSale] = useState<string | null>(null)
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<string | null>(null)

  // Client search results for sale modal
  const clientSearchResults = saleClientSearch.trim().length > 0
    ? clients.filter(c => {
      const q = saleClientSearch.toLowerCase()
      return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
    }).slice(0, 6)
    : []

  function getDateRange() {
    const now = new Date()
    if (period === 'this_month') return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') }
    if (period === 'last_month') { const l = subMonths(now, 1); return { from: format(startOfMonth(l), 'yyyy-MM-dd'), to: format(endOfMonth(l), 'yyyy-MM-dd') } }
    return { from: customFrom, to: customTo }
  }

  const fetchData = useCallback(async () => {
    const { from, to } = getDateRange()
    if (!from || !to) return
    setLoading(true)

    // Fixed expenses are config (not date-bound): fetch them unfiltered by date,
    // still scoped to the tenant by business_id.
    const [apptRes, salesRes, expRes, prodRes, clientRes, fixedRes] = await Promise.all([
      supabase.from('appointments').select('*, services(name, price)')
        .eq('business_id', businessId).neq('status', 'cancelled').gte('date', from).lte('date', to).order('date', { ascending: false }),
      supabase.from('manual_sales').select('*')
        .eq('business_id', businessId).gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false }),
      supabase.from('expenses').select('*')
        .eq('business_id', businessId).gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }),
      supabase.from('saved_products').select('*').eq('business_id', businessId).order('name'),
      supabase.from('clients').select('*').eq('business_id', businessId).order('name'),
      supabase.from('fixed_expenses').select('*').eq('business_id', businessId).order('amount', { ascending: false }),
    ])

    setAppointments(apptRes.data || [])
    setSales(salesRes.data || [])
    setExpenses(expRes.data || [])
    setSavedProducts(prodRes.data || [])
    setClients(clientRes.data || [])
    setFixedExpenses(fixedRes.data || [])

    // Active fixed expenses contribute a recurring monthly amount to every month.
    const fixedMonthlyLocal = (fixedRes.data || [])
      .filter(f => f.active)
      .reduce((sum, f) => sum + monthlyEquivalent(Number(f.amount), f.frequency), 0)

    // Chart: last 6 months
    const now = new Date()
    const chart = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(now, 5 - i)
        const mFrom = format(startOfMonth(d), 'yyyy-MM-dd')
        const mTo = format(endOfMonth(d), 'yyyy-MM-dd')
        return Promise.all([
          supabase.from('appointments').select('services(price)').eq('business_id', businessId).neq('status', 'cancelled').gte('date', mFrom).lte('date', mTo),
          supabase.from('manual_sales').select('amount, quantity').eq('business_id', businessId).gte('sale_date', mFrom).lte('sale_date', mTo),
          supabase.from('expenses').select('amount').eq('business_id', businessId).gte('expense_date', mFrom).lte('expense_date', mTo),
        ]).then(([a, s, e]) => ({
          name: format(d, 'MMM', { locale: es }),
          ingresos: (a.data || []).reduce((sum, x) => sum + ((x.services as { price?: number } | null)?.price || 0), 0)
            + (s.data || []).reduce((sum, x) => sum + Number(x.amount) * Number(x.quantity), 0),
          egresos: (e.data || []).reduce((sum, x) => sum + Number(x.amount), 0) + fixedMonthlyLocal,
        }))
      })
    )
    setChartData(chart)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo, businessId])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Stats ───────────────────────────────────────────────────────────────────
  const { from: rangeFrom, to: rangeTo } = getDateRange()
  const apptRevenue = appointments.reduce((s, a) => s + ((a.services as { price?: number } | null)?.price || 0), 0)
  const salesRevenue = sales.reduce((s, x) => s + Number(x.amount) * Number(x.quantity), 0)
  const totalIncome = apptRevenue + salesRevenue

  // Variable (one-off) expenses come from the expenses table.
  const variableExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)

  // Active fixed expenses normalized to a monthly amount → recurring egresos.
  // Month views apply a factor of 1; a custom range is prorated by its length
  // in months (≈30.44 days/month).
  const activeFixed = fixedExpenses.filter(f => f.active)
  const fixedMonthly = activeFixed.reduce((s, f) => s + monthlyEquivalent(Number(f.amount), f.frequency), 0)
  const monthsInPeriod = period === 'custom' && rangeFrom && rangeTo
    ? Math.max((differenceInCalendarDays(parseISO(rangeTo), parseISO(rangeFrom)) + 1) / 30.44, 0)
    : 1
  const recurringExpenses = fixedMonthly * monthsInPeriod

  const totalExpenses = variableExpenses + recurringExpenses
  const balance = totalIncome - totalExpenses

  // Margen: porción del ingreso que queda como saldo.
  const margin = totalIncome > 0 ? (balance / totalIncome) * 100 : 0

  // Ranking de servicios y productos por ingreso (turnos por servicio + ventas por descripción).
  const rankingMap = new Map<string, { label: string; total: number; count: number }>()
  for (const a of appointments) {
    const svc = a.services as { name?: string; price?: number } | null
    const label = svc?.name || 'Sin servicio'
    const cur = rankingMap.get(label) || { label, total: 0, count: 0 }
    cur.total += svc?.price || 0
    cur.count += 1
    rankingMap.set(label, cur)
  }
  for (const s of sales) {
    const label = s.description || 'Venta'
    const cur = rankingMap.get(label) || { label, total: 0, count: 0 }
    cur.total += Number(s.amount) * Number(s.quantity)
    cur.count += Number(s.quantity)
    rankingMap.set(label, cur)
  }
  const ranking = [...rankingMap.values()].sort((a, b) => b.total - a.total).slice(0, 6)
  const rankingMax = ranking.length ? ranking[0].total : 0

  // Todos los gastos fijos (activos y pausados) con su monto mensual normalizado,
  // ordenados de mayor a menor. La card de gestión usa SIEMPRE este orden, así que
  // se reordena solo al agregar / editar / pausar (es un derivado del estado).
  const fixedSorted = [...fixedExpenses]
    .map(f => ({ ...f, monthly: monthlyEquivalent(Number(f.amount), f.frequency) }))
    .sort((a, b) => b.monthly - a.monthly)
  const fixedSortedMax = fixedSorted.length ? fixedSorted[0].monthly : 0

  // Cashflow diario del período seleccionado.
  const dailyCashflow = buildDailyCashflow()

  // ── Shared helpers ────────────────────────────────────────────────────────────
  function isNewProduct(name: string, type: 'income' | 'expense') {
    return !savedProducts.find(p => p.name.toLowerCase() === name.trim().toLowerCase() && p.type === type)
  }

  async function confirmSaveProduct() {
    const name = pendingProductName.trim()
    if (!name) return
    const { data } = await supabase.from('saved_products')
      .insert({ business_id: businessId, name, type: pendingProductType })
      .select().single()
    if (data) setSavedProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setPendingProductName('')
    setAskSaveSale(false)
    setAskSaveExpense(false)
    toast.success('Guardado como producto frecuente')
  }

  function dismissSaveProduct() {
    setPendingProductName('')
    setAskSaveSale(false)
    setAskSaveExpense(false)
    toast.success(askSaveSale ? 'Venta registrada' : 'Egreso registrado')
  }

  // ── Sales CRUD ────────────────────────────────────────────────────────────────
  function resetSaleClientState() {
    setSaleClientMode('none')
    setSaleClientSearch('')
    setSaleClientSelected(null)
    setSaleNewClient({ name: '', phone: '', email: '' })
  }

  function openNewSale() {
    setEditSale(null)
    setSaleForm({ description: '', quantity: '1', amount: '', date: format(new Date(), 'yyyy-MM-dd'), type: 'venta' })
    resetSaleClientState()
    setSaleModal(true)
  }
  function openEditSale(s: ManualSale) {
    setEditSale(s)
    setSaleForm({ description: s.description, quantity: String(s.quantity), amount: String(s.amount), date: s.sale_date, type: s.type })
    resetSaleClientState()
    if (s.client_id) {
      const existing = clients.find(c => c.id === s.client_id)
      if (existing) { setSaleClientMode('search'); setSaleClientSelected(existing) }
    }
    setSaleModal(true)
  }

  async function saveSale() {
    if (!saleForm.description || !saleForm.amount) { toast.error('Completá descripción y monto'); return }
    setSavingSale(true)

    // Resolve client_id
    let clientId: string | null = null
    if (saleClientSelected) {
      clientId = saleClientSelected.id
    } else if (saleClientMode === 'new' && saleNewClient.name.trim()) {
      const { data: nc } = await supabase.from('clients').insert({
        business_id: businessId,
        name: saleNewClient.name.trim(),
        phone: saleNewClient.phone.trim() || null,
        email: saleNewClient.email.trim() || null,
      }).select().single()
      if (nc) { setClients(prev => [...prev, nc].sort((a, b) => a.name.localeCompare(b.name))); clientId = nc.id }
    }

    const payload = {
      business_id: businessId,
      description: saleForm.description.trim(),
      quantity: parseInt(saleForm.quantity) || 1,
      amount: parseFloat(saleForm.amount),
      sale_date: saleForm.date,
      type: saleForm.type,
      client_id: clientId,
    }

    if (editSale) {
      const { error } = await supabase.from('manual_sales').update(payload).eq('id', editSale.id)
      setSavingSale(false)
      if (error) { toast.error('Error al guardar'); return }
      setSales(prev => prev.map(s => s.id === editSale.id ? { ...s, ...payload } : s))
      toast.success('Venta actualizada')
      setSaleModal(false)
    } else {
      const { data, error } = await supabase.from('manual_sales').insert(payload).select().single()
      setSavingSale(false)
      if (error) { toast.error('Error al guardar'); return }
      setSales(prev => [data, ...prev])
      setSaleModal(false)
      const desc = saleForm.description.trim()
      if (isNewProduct(desc, 'income')) {
        setPendingProductName(desc)
        setPendingProductType('income')
        setAskSaveSale(true)
      } else {
        toast.success('Venta registrada')
      }
    }
  }

  async function deleteSale(id: string) {
    const { error } = await supabase.from('manual_sales').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    setSales(prev => prev.filter(s => s.id !== id))
    setConfirmDeleteSale(null)
    toast.success('Venta eliminada')
  }

  // ── Expenses CRUD ─────────────────────────────────────────────────────────────
  function openNewExpense() {
    setEditExpense(null)
    setExpenseForm({ category: 'Insumos', concepto: '', amount: '', date: format(new Date(), 'yyyy-MM-dd') })
    setExpenseModal(true)
  }
  function openEditExpense(e: Expense) {
    setEditExpense(e)
    setExpenseForm({ category: e.category, concepto: e.notes || '', amount: String(e.amount), date: e.expense_date })
    setExpenseModal(true)
  }
  async function saveExpense() {
    if (!expenseForm.amount) { toast.error('Ingresá un monto'); return }
    setSavingExpense(true)
    const payload = { business_id: businessId, category: expenseForm.category, amount: parseFloat(expenseForm.amount), expense_date: expenseForm.date, notes: expenseForm.concepto.trim() || null }
    if (editExpense) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editExpense.id)
      setSavingExpense(false)
      if (error) { toast.error('Error al guardar'); return }
      setExpenses(prev => prev.map(e => e.id === editExpense.id ? { ...e, ...payload } : e))
      toast.success('Egreso actualizado')
      setExpenseModal(false)
    } else {
      const { data, error } = await supabase.from('expenses').insert(payload).select().single()
      setSavingExpense(false)
      if (error) { toast.error('Error al guardar'); return }
      setExpenses(prev => [data, ...prev])
      setExpenseModal(false)
      const concepto = expenseForm.concepto.trim()
      if (concepto && isNewProduct(concepto, 'expense')) {
        setPendingProductName(concepto)
        setPendingProductType('expense')
        setAskSaveExpense(true)
      } else {
        toast.success('Egreso registrado')
      }
    }
  }
  async function deleteExpense(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    setExpenses(prev => prev.filter(e => e.id !== id))
    setConfirmDeleteExpense(null)
    toast.success('Egreso eliminado')
  }

  async function markPaid(id: string) {
    const { error } = await supabase.from('appointments').update({ payment_status: 'paid' }).eq('id', id)
    if (error) { toast.error('Error'); return }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, payment_status: 'paid' } : a))
    toast.success('Marcado como pagado')
  }

  // ── Daily cashflow ──────────────────────────────────────────────────────────
  // Ingresos y egresos por día del período. Los gastos fijos caen en su día de
  // vencimiento (solo en vistas de mes; en rangos largos el detalle diario no aporta).
  function buildDailyCashflow() {
    if (!rangeFrom || !rangeTo) return [] as { date: string; label: string; ingresos: number; egresos: number; neto: number }[]
    const start = parseISO(rangeFrom)
    const end = parseISO(rangeTo)
    if (end < start) return []
    const days = eachDayOfInterval({ start, end })
    if (days.length > 92) return [] // rango muy largo: el cashflow diario no aporta

    const inc = new Map<string, number>()
    const eg = new Map<string, number>()
    for (const a of appointments) inc.set(a.date, (inc.get(a.date) || 0) + ((a.services as { price?: number } | null)?.price || 0))
    for (const s of sales) inc.set(s.sale_date, (inc.get(s.sale_date) || 0) + Number(s.amount) * Number(s.quantity))
    for (const e of expenses) eg.set(e.expense_date, (eg.get(e.expense_date) || 0) + Number(e.amount))
    if (period !== 'custom') {
      for (const f of activeFixed) {
        const day = f.due_day && f.due_day >= 1 && f.due_day <= 31 ? f.due_day : 1
        const target = days.find(d => d.getDate() === day) || days[days.length - 1]
        const k = format(target, 'yyyy-MM-dd')
        eg.set(k, (eg.get(k) || 0) + monthlyEquivalent(Number(f.amount), f.frequency))
      }
    }
    return days.map(d => {
      const k = format(d, 'yyyy-MM-dd')
      const ingresos = inc.get(k) || 0
      const egresos = eg.get(k) || 0
      return { date: k, label: format(d, 'd'), ingresos, egresos, neto: ingresos - egresos }
    })
  }

  // ── Fixed expenses CRUD ───────────────────────────────────────────────────────
  function openNewFixed(presetName = '') {
    setEditFixed(null)
    setFixedForm({ name: presetName, amount: '', frequency: 'monthly', due_day: '' })
    setFixedModal(true)
  }
  function openEditFixed(f: FixedExpense) {
    setEditFixed(f)
    setFixedForm({ name: f.name, amount: String(f.amount), frequency: f.frequency, due_day: f.due_day ? String(f.due_day) : '' })
    setFixedModal(true)
  }
  async function saveFixed() {
    if (!fixedForm.name.trim()) { toast.error('Ingresá un nombre'); return }
    if (!fixedForm.amount) { toast.error('Ingresá un monto'); return }
    setSavingFixed(true)
    const dueDay = fixedForm.due_day ? Math.min(Math.max(parseInt(fixedForm.due_day), 1), 31) : null
    const payload = {
      business_id: businessId,
      name: fixedForm.name.trim(),
      amount: parseFloat(fixedForm.amount),
      frequency: fixedForm.frequency,
      due_day: dueDay,
    }
    if (editFixed) {
      const { error } = await supabase.from('fixed_expenses').update(payload).eq('id', editFixed.id)
      setSavingFixed(false)
      if (error) { toast.error('Error al guardar'); return }
      setFixedExpenses(prev => prev.map(f => f.id === editFixed.id ? { ...f, ...payload } : f))
      setFixedModal(false)
      toast.success('Gasto fijo actualizado')
    } else {
      const { data, error } = await supabase.from('fixed_expenses').insert({ ...payload, active: true }).select().single()
      setSavingFixed(false)
      if (error) { toast.error('Error al guardar'); return }
      setFixedExpenses(prev => [...prev, data])
      setFixedModal(false)
      toast.success('Gasto fijo agregado')
    }
  }
  async function toggleFixed(f: FixedExpense) {
    const next = !f.active
    const { error } = await supabase.from('fixed_expenses').update({ active: next }).eq('id', f.id)
    if (error) { toast.error('Error'); return }
    setFixedExpenses(prev => prev.map(x => x.id === f.id ? { ...x, active: next } : x))
  }
  async function deleteFixed(id: string) {
    const { error } = await supabase.from('fixed_expenses').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    setFixedExpenses(prev => prev.filter(f => f.id !== id))
    setConfirmDeleteFixed(null)
    toast.success('Gasto fijo eliminado')
  }

  return (
    <div className="space-y-6">
      {/* Header + period selector */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <PageEyebrow label="Reportes" />
          <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Finanzas</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['this_month', 'last_month', 'custom'] as Period[]).map(p => (
            <Button key={p} size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)}>
              {p === 'this_month' ? 'Este mes' : p === 'last_month' ? 'Mes anterior' : 'Personalizado'}
            </Button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex gap-2 items-end">
          <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-40" /></div>
        </div>
      )}

      {/* Hero KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="pt-5 h-24 animate-pulse bg-secondary/30 rounded-lg" /></Card>)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Saldo del mes — destacado */}
            <Card className="col-span-2 lg:col-span-1 lg:row-span-2 border-[#2a5fa5]/30 bg-[#2a5fa5]/[0.04]">
              <CardContent className="pt-5 h-full flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1.5"><Activity className="w-4 h-4 text-[#2a5fa5]" /><span className="text-xs text-muted-foreground">Saldo del mes</span></div>
                <p className={`text-3xl lg:text-[2.5rem] leading-none font-bold font-[family-name:var(--font-heading)] ${balance >= 0 ? 'text-[#2a5fa5]' : 'text-destructive'}`}>{fmtARS(balance)}</p>
                <p className="text-xs text-muted-foreground mt-3">{margin.toFixed(1)}% de margen sobre los ingresos del mes</p>
              </CardContent>
            </Card>
            {/* Ingresos */}
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-[#3fa46a]" /><span className="text-xs text-muted-foreground">Ingresos</span></div>
              <p className="text-xl font-bold text-[#3fa46a]">{fmtARS(totalIncome)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Servicios {fmtARS(apptRevenue)} · Ventas {fmtARS(salesRevenue)}</p>
            </CardContent></Card>
            {/* Egresos */}
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-destructive" /><span className="text-xs text-muted-foreground">Egresos</span></div>
              <p className="text-xl font-bold text-destructive">{fmtARS(totalExpenses)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Variables {fmtARS(variableExpenses)} · Fijos {fmtARS(recurringExpenses)}</p>
            </CardContent></Card>
            {/* Margen */}
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1"><Percent className={`w-4 h-4 ${margin >= 0 ? 'text-[#2a5fa5]' : 'text-destructive'}`} /><span className="text-xs text-muted-foreground">Margen</span></div>
              <p className={`text-xl font-bold ${margin >= 0 ? 'text-[#2a5fa5]' : 'text-destructive'}`}>{margin.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">sobre ingresos del mes</p>
            </CardContent></Card>
            {/* Cantidad de turnos */}
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Cantidad de turnos</span></div>
              <p className="text-xl font-bold">{appointments.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">en el período</p>
            </CardContent></Card>
          </div>

          {/* RESUMEN DEL MES — ingresos por servicios, ventas y gastos */}
          <div>
            <p className="text-xs font-bold tracking-widest text-muted-foreground mb-2.5">RESUMEN DEL MES</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="relative overflow-hidden"><CardContent className="pt-5 pb-6">
                <div className="flex items-center gap-2 mb-1"><Calendar className="w-4 h-4 text-[#3fa46a]" /><span className="text-xs text-muted-foreground">Servicios</span></div>
                <p className="text-2xl font-bold text-[#3fa46a]">{fmtARS(apptRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{appointments.length} {appointments.length === 1 ? 'turno confirmado' : 'turnos confirmados'}</p>
                <div className="absolute left-0 right-0 bottom-0 h-1 bg-[#3fa46a]" />
              </CardContent></Card>
              <Card className="relative overflow-hidden"><CardContent className="pt-5 pb-6">
                <div className="flex items-center gap-2 mb-1"><ShoppingBag className="w-4 h-4 text-[#2a5fa5]" /><span className="text-xs text-muted-foreground">Ventas</span></div>
                <p className="text-2xl font-bold text-[#2a5fa5]">{fmtARS(salesRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sales.length} {sales.length === 1 ? 'venta registrada' : 'ventas registradas'}</p>
                <div className="absolute left-0 right-0 bottom-0 h-1 bg-[#2a5fa5]" />
              </CardContent></Card>
              <Card className="relative overflow-hidden"><CardContent className="pt-5 pb-6">
                <div className="flex items-center gap-2 mb-1"><Receipt className="w-4 h-4 text-destructive" /><span className="text-xs text-muted-foreground">Gastos</span></div>
                <p className="text-2xl font-bold text-destructive">{fmtARS(totalExpenses)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{new Set(expenses.map(e => e.category || 'Otro')).size} categorías</p>
                <div className="absolute left-0 right-0 bottom-0 h-1 bg-destructive" />
              </CardContent></Card>
            </div>
          </div>
        </>
      )}

      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Últimos 6 meses</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                  formatter={(v, name) => [fmtARS(Number(v)), name === 'ingresos' ? 'Ingresos' : 'Egresos']} />
                <Bar dataKey="ingresos" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="egresos" fill="var(--destructive)" radius={[3, 3, 0, 0]} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cashflow diario */}
      {!loading && dailyCashflow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-muted-foreground" /> Cashflow diario</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={dailyCashflow}>
                <defs>
                  <linearGradient id="cfIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cfOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} width={48} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                  labelFormatter={l => `Día ${l}`}
                  formatter={(v, name) => [fmtARS(Number(v)), name === 'ingresos' ? 'Ingresos' : 'Egresos']} />
                <Area type="monotone" dataKey="ingresos" stroke="var(--primary)" fill="url(#cfIn)" strokeWidth={2} />
                <Area type="monotone" dataKey="egresos" stroke="var(--destructive)" fill="url(#cfOut)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ranking de servicios + gestión de gastos fijos */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ranking.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Award className="w-4 h-4 text-muted-foreground" /> Ranking de servicios</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {ranking.map(r => (
                  <div key={r.label} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{r.label}</span>
                      <span className="flex-shrink-0 tabular-nums">{fmtARS(r.total)} <span className="text-xs text-muted-foreground">· {r.count}</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${rankingMax > 0 ? (r.total / rankingMax) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Gastos fijos — única tarjeta de gestión (alta, edición, pausar, eliminar) */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm flex items-center gap-2"><Receipt className="w-4 h-4 text-muted-foreground" /> Gastos fijos</CardTitle>
              <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => openNewFixed()}><Plus className="w-3.5 h-3.5" /> Nuevo gasto fijo</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Carga rápida: abre el modal con el nombre prellenado (nada se precarga solo) */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center">Rápido:</span>
                {FIXED_PRESETS.map(p => (
                  <Button key={p} size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openNewFixed(p)}>
                    <Plus className="w-3 h-3" /> {p}
                  </Button>
                ))}
              </div>

              {fixedSorted.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Sin gastos fijos cargados.</p>
              ) : (
                <>
                  {fixedMonthly > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Total mensual: <span className="font-semibold text-red-400">{fmtARS(fixedMonthly)}</span>
                    </p>
                  )}
                  <div className="space-y-2.5">
                    {fixedSorted.map(f => (
                      <div key={f.id} className={`space-y-1 ${!f.active ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{f.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {FIXED_FREQ_LABEL[f.frequency] || f.frequency}
                              {f.due_day && <> · vence el {f.due_day}</>}
                              {!f.active && <> · pausado</>}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <span className="tabular-nums text-red-400 font-semibold mr-1">{fmtARS(f.monthly)}<span className="text-xs text-muted-foreground">/mes</span></span>
                            <Button size="icon" variant="ghost" className={`h-7 w-7 ${f.active ? 'text-green-400' : 'text-muted-foreground'}`}
                              title={f.active ? 'Pausar' : 'Activar'} onClick={() => toggleFixed(f)}><Power className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => openEditFixed(f)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => setConfirmDeleteFixed(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-red-400/70 rounded-full" style={{ width: `${fixedSortedMax > 0 ? (f.monthly / fixedSortedMax) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">Turnos ({appointments.length})</TabsTrigger>
          <TabsTrigger value="sales">Ventas ({sales.length})</TabsTrigger>
          <TabsTrigger value="expenses">Egresos ({expenses.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-2 mt-4">
          {appointments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">Sin turnos en este período</p>
          ) : appointments.map(appt => {
            const service = appt.services as { name?: string; price?: number } | null
            return (
              <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border text-sm">
                <span className="text-muted-foreground w-20 flex-shrink-0">{format(parseISO(appt.date), 'd MMM', { locale: es })} {appt.time.slice(0, 5)}</span>
                <span className="flex-1 truncate font-medium">{appt.client_name}</span>
                <span className="text-muted-foreground hidden sm:block truncate max-w-32">{service?.name}</span>
                <span className="font-semibold">{fmtARS(service?.price || 0)}</span>
                {appt.payment_status === 'paid' ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex-shrink-0" variant="outline">Pagado</Badge>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0" onClick={() => markPaid(appt.id)}>Cobrar</Button>
                )}
              </div>
            )
          })}
        </TabsContent>

        <TabsContent value="sales" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={openNewSale}><Plus className="w-4 h-4" /> Nueva venta</Button>
          </div>
          {sales.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">Sin ventas en este período</p>
          ) : sales.map(sale => {
            const linkedClient = sale.client_id ? clients.find(c => c.id === sale.client_id) : null
            return (
              <div key={sale.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border text-sm">
                <span className="text-muted-foreground w-20 flex-shrink-0">{format(parseISO(sale.sale_date), 'd MMM', { locale: es })}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{sale.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {sale.type} · cant. {sale.quantity}
                    {linkedClient && <span> · <User className="inline w-3 h-3" /> {linkedClient.name}</span>}
                  </p>
                </div>
                <span className="font-semibold">{fmtARS(Number(sale.amount) * Number(sale.quantity))}</span>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => openEditSale(sale)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => setConfirmDeleteSale(sale.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            )
          })}
        </TabsContent>

        <TabsContent value="expenses" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={openNewExpense}><Plus className="w-4 h-4" /> Nuevo egreso</Button>
          </div>
          {expenses.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">Sin egresos en este período</p>
          ) : expenses.map(exp => (
            <div key={exp.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border text-sm">
              <span className="text-muted-foreground w-20 flex-shrink-0">{format(parseISO(exp.expense_date), 'd MMM', { locale: es })}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{exp.category}</p>
                {exp.notes && <p className="text-xs text-muted-foreground truncate">{exp.notes}</p>}
              </div>
              <span className="font-semibold text-red-400">{fmtARS(Number(exp.amount))}</span>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => openEditExpense(exp)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => setConfirmDeleteExpense(exp.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </TabsContent>

      </Tabs>

      {/* ── Sale modal ──────────────────────────────────────────────────────────── */}
      <Dialog open={saleModal} onOpenChange={setSaleModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editSale ? 'Editar venta' : 'Nueva venta'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Descripción *</Label>
              <ProductCombobox
                value={saleForm.description}
                onChange={v => setSaleForm(f => ({ ...f, description: v }))}
                products={incomeProducts}
                placeholder="Ej: Corte de pelo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cantidad</Label>
                <Input type="text" inputMode="numeric" value={saleForm.quantity}
                  onChange={e => setSaleForm(f => ({ ...f, quantity: e.target.value.replace(/\D/g, '') || '1' }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Monto *</Label>
                <Input type="text" inputMode="numeric" value={saleForm.amount}
                  onChange={e => setSaleForm(f => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fecha</Label>
                <Input type="date" value={saleForm.date} onChange={e => setSaleForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={saleForm.type} onValueChange={v => setSaleForm(f => ({ ...f, type: v ?? 'venta' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venta">Venta</SelectItem>
                    <SelectItem value="servicio">Servicio</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Client association */}
            <div className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Asociar a cliente <span className="italic">(opcional)</span></Label>
                {saleClientMode !== 'none' && (
                  <button type="button" onClick={resetSaleClientState} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {saleClientMode === 'none' && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs flex-1" onClick={() => setSaleClientMode('search')}>
                    <Search className="w-3 h-3" /> Buscar
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 h-7 text-xs flex-1" onClick={() => setSaleClientMode('new')}>
                    <UserPlus className="w-3 h-3" /> Nuevo
                  </Button>
                </div>
              )}

              {saleClientMode === 'search' && (
                <div className="space-y-1.5">
                  {saleClientSelected ? (
                    <div className="flex items-center gap-2 p-2 rounded bg-secondary/50 text-sm">
                      <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 font-medium">{saleClientSelected.name}</span>
                      {saleClientSelected.phone && <span className="text-xs text-muted-foreground">{saleClientSelected.phone}</span>}
                      <button type="button" onClick={() => { setSaleClientSelected(null); setSaleClientSearch('') }}>
                        <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={saleClientSearch}
                          onChange={e => setSaleClientSearch(e.target.value)}
                          placeholder="Nombre o teléfono..."
                          className="h-8 text-sm pl-8"
                          autoComplete="off"
                        />
                      </div>
                      {saleClientSearch.trim().length > 0 && (
                        <div className="border border-border rounded-md overflow-hidden max-h-36 overflow-y-auto">
                          {clientSearchResults.length > 0
                            ? clientSearchResults.map(c => (
                              <button key={c.id} type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                onClick={() => { setSaleClientSelected(c); setSaleClientSearch('') }}>
                                <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="flex-1">{c.name}</span>
                                {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                              </button>
                            ))
                            : (
                              <div className="px-3 py-2 text-sm text-muted-foreground flex items-center justify-between">
                                <span>Sin resultados</span>
                                <button type="button" className="text-primary text-xs hover:underline"
                                  onClick={() => { setSaleClientMode('new'); setSaleNewClient(f => ({ ...f, name: saleClientSearch })); setSaleClientSearch('') }}>
                                  Crear nuevo →
                                </button>
                              </div>
                            )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {saleClientMode === 'new' && (
                <div className="space-y-1.5">
                  <Input value={saleNewClient.name} onChange={e => setSaleNewClient(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nombre *" className="h-8 text-sm" />
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input value={saleNewClient.phone} onChange={e => setSaleNewClient(f => ({ ...f, phone: e.target.value }))}
                      placeholder="Teléfono" className="h-8 text-sm" />
                    <Input type="email" value={saleNewClient.email} onChange={e => setSaleNewClient(f => ({ ...f, email: e.target.value }))}
                      placeholder="Email" className="h-8 text-sm" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setSaleModal(false)}>Cancelar</Button>
              <Button onClick={saveSale} disabled={savingSale}>{savingSale ? 'Guardando...' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Expense modal ───────────────────────────────────────────────────────── */}
      <Dialog open={expenseModal} onOpenChange={setExpenseModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editExpense ? 'Editar egreso' : 'Nuevo egreso'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Concepto <span className="text-muted-foreground">(opcional)</span></Label>
              <ProductCombobox
                value={expenseForm.concepto}
                onChange={v => setExpenseForm(f => ({ ...f, concepto: v }))}
                products={expenseProducts}
                placeholder="Ej: Shampoo, Tinte..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <Select value={expenseForm.category} onValueChange={v => setExpenseForm(f => ({ ...f, category: v ?? 'Insumos' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Monto *</Label>
                <Input type="text" inputMode="numeric" value={expenseForm.amount}
                  onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha</Label>
                <Input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setExpenseModal(false)}>Cancelar</Button>
              <Button onClick={saveExpense} disabled={savingExpense}>{savingExpense ? 'Guardando...' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fixed expense modal ──────────────────────────────────────────────────── */}
      <Dialog open={fixedModal} onOpenChange={setFixedModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editFixed ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input value={fixedForm.name} onChange={e => setFixedForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Alquiler" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Monto *</Label>
                <Input type="text" inputMode="numeric" value={fixedForm.amount}
                  onChange={e => setFixedForm(f => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frecuencia</Label>
                <Select value={fixedForm.frequency} onValueChange={v => setFixedForm(f => ({ ...f, frequency: v ?? 'monthly' }))}>
                  {/* Base UI Select.Value muestra el value crudo por defecto; mapeamos a su label en español. */}
                  <SelectTrigger><SelectValue>{(value: string) => FIXED_FREQ_LABEL[value] ?? value}</SelectValue></SelectTrigger>
                  <SelectContent>{FIXED_FREQUENCIES.map(fr => <SelectItem key={fr.value} value={fr.value}>{fr.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Día de vencimiento <span className="text-muted-foreground">(opcional)</span></Label>
              <Input type="text" inputMode="numeric" value={fixedForm.due_day}
                onChange={e => setFixedForm(f => ({ ...f, due_day: e.target.value.replace(/\D/g, '').slice(0, 2) }))} placeholder="Ej: 10" />
            </div>
            {fixedForm.amount && fixedForm.frequency !== 'monthly' && (
              <p className="text-xs text-muted-foreground">
                Equivale a <span className="font-medium text-foreground">{fmtARS(monthlyEquivalent(parseFloat(fixedForm.amount) || 0, fixedForm.frequency))}</span> por mes.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setFixedModal(false)}>Cancelar</Button>
              <Button onClick={saveFixed} disabled={savingFixed}>{savingFixed ? 'Guardando...' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteFixed} onOpenChange={open => !open && setConfirmDeleteFixed(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar gasto fijo?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Dejará de impactar en el saldo del mes. Si solo querés pausarlo temporalmente, usá el botón de activar/pausar.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteFixed(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDeleteFixed && deleteFixed(confirmDeleteFixed)}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ¿Guardar como producto frecuente? ───────────────────────────────────── */}
      {[
        { open: askSaveSale, onClose: () => !askSaveSale },
        { open: askSaveExpense, onClose: () => !askSaveExpense },
      ].map((_, idx) => (
        <Dialog key={idx} open={idx === 0 ? askSaveSale : askSaveExpense}
          onOpenChange={open => !open && dismissSaveProduct()}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>¿Guardar como producto frecuente?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              <strong>&ldquo;{pendingProductName}&rdquo;</strong> aparecerá en el desplegable de {pendingProductType === 'income' ? 'ventas' : 'egresos'} para agilizar el registro.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={dismissSaveProduct}>No, gracias</Button>
              <Button onClick={confirmSaveProduct}>Guardar</Button>
            </div>
          </DialogContent>
        </Dialog>
      ))}

      {/* ── Confirm deletes ──────────────────────────────────────────────────────── */}
      <Dialog open={!!confirmDeleteSale} onOpenChange={open => !open && setConfirmDeleteSale(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar venta?</DialogTitle></DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteSale(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDeleteSale && deleteSale(confirmDeleteSale)}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteExpense} onOpenChange={open => !open && setConfirmDeleteExpense(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar egreso?</DialogTitle></DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteExpense(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDeleteExpense && deleteExpense(confirmDeleteExpense)}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
