'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Appointment, ManualSale, Expense, SavedProduct, Client } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DollarSign, TrendingUp, TrendingDown, Minus, Plus, Pencil, Trash2,
  ChevronDown, Search, UserPlus, User, X,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

type Period = 'this_month' | 'last_month' | 'custom'
type ClientMode = 'none' | 'search' | 'new'
const EXPENSE_CATEGORIES = ['Insumos', 'Alquiler', 'Servicios', 'Personal', 'Marketing', 'Impuestos', 'Otro']
function fmtARS(n: number) { return '$' + Number(n).toLocaleString('es-AR') }

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
  const [chartData, setChartData] = useState<{ name: string; ingresos: number; egresos: number }[]>([])

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

    const [apptRes, salesRes, expRes, prodRes, clientRes] = await Promise.all([
      supabase.from('appointments').select('*, services(name, price)')
        .eq('business_id', businessId).neq('status', 'cancelled').gte('date', from).lte('date', to).order('date', { ascending: false }),
      supabase.from('manual_sales').select('*')
        .eq('business_id', businessId).gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false }),
      supabase.from('expenses').select('*')
        .eq('business_id', businessId).gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }),
      supabase.from('saved_products').select('*').eq('business_id', businessId).order('name'),
      supabase.from('clients').select('*').eq('business_id', businessId).order('name'),
    ])

    setAppointments(apptRes.data || [])
    setSales(salesRes.data || [])
    setExpenses(expRes.data || [])
    setSavedProducts(prodRes.data || [])
    setClients(clientRes.data || [])

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
          egresos: (e.data || []).reduce((sum, x) => sum + Number(x.amount), 0),
        }))
      })
    )
    setChartData(chart)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo, businessId])

  useEffect(() => { fetchData() }, [fetchData])

  // Stats
  const apptRevenue = appointments.reduce((s, a) => s + ((a.services as { price?: number } | null)?.price || 0), 0)
  const salesRevenue = sales.reduce((s, x) => s + Number(x.amount) * Number(x.quantity), 0)
  const totalIncome = apptRevenue + salesRevenue
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const balance = totalIncome - totalExpenses

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

  return (
    <div className="space-y-6">
      {/* Header + period selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Finanzas</h1>
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

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="pt-5 h-24 animate-pulse bg-secondary/30 rounded-lg" /></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-xs text-muted-foreground">Ingresos</span></div>
            <p className="text-xl font-bold text-green-400">{fmtARS(totalIncome)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Turnos {fmtARS(apptRevenue)} · Ventas {fmtARS(salesRevenue)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-red-400" /><span className="text-xs text-muted-foreground">Egresos</span></div>
            <p className="text-xl font-bold text-red-400">{fmtARS(totalExpenses)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1"><Minus className={`w-4 h-4 ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`} /><span className="text-xs text-muted-foreground">Balance</span></div>
            <p className={`text-xl font-bold ${balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmtARS(balance)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Turnos</span></div>
            <p className="text-xl font-bold">{appointments.length}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Últimos 6 meses</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
                  formatter={(v, name) => [fmtARS(Number(v)), name === 'ingresos' ? 'Ingresos' : 'Egresos']} />
                <Bar dataKey="ingresos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="egresos" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
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
