import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDownLeft, ArrowUpRight, BookOpen, Check, ChevronLeft, ChevronRight,
  Download, Pencil, Plus, ReceiptText, Search, ShieldCheck, Trash2, Wallet, X,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

type TransactionType = 'expense' | 'income';
type Transaction = {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  category: string;
  date: string;
  note?: string;
};
type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';
type Draft = Omit<Transaction, 'id'>;

const STORAGE_KEY = 'little-ledger-transactions';
const CURRENCY_KEY = 'little-ledger-currency';
const expenseCategories = ['Housing', 'Food', 'Transport', 'Shopping', 'Health', 'Bills', 'Other'];
const incomeCategories = ['Salary', 'Freelance', 'Gift', 'Investment', 'Other'];
const categoryColors: Record<string, string> = {
  Housing: '#4d7c68', Food: '#d18162', Transport: '#75989b', Shopping: '#bd9c55',
  Health: '#987f9f', Bills: '#b8755c', Other: '#8b9a78', Salary: '#4d7c68',
  Freelance: '#75989b', Gift: '#bd9c55', Investment: '#987f9f',
};
const currencies: { code: CurrencyCode; label: string }[] = [
  { code: 'INR', label: 'INR · ₹' }, { code: 'USD', label: 'USD · $' },
  { code: 'EUR', label: 'EUR · €' }, { code: 'GBP', label: 'GBP · £' },
];
const queryClient = new QueryClient();

function validTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && (item.type === 'expense' || item.type === 'income')
    && typeof item.description === 'string' && item.description.trim().length > 0
    && typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount > 0
    && typeof item.category === 'string' && item.category.trim().length > 0
    && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && (item.note === undefined || typeof item.note === 'string');
}

function loadTransactions(): Transaction[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validTransaction);
  } catch {
    return [];
  }
}

function getToday() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatCurrency(amount: number, currency: CurrencyCode) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function monthKey(date: string) { return date.slice(0, 7); }
function formatDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(parsed);
}
function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}
function shiftMonth(key: string, offset: number) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>(loadTransactions);
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    try {
      const saved = localStorage.getItem(CURRENCY_KEY);
      return currencies.some((item) => item.code === saved) ? saved as CurrencyCode : 'INR';
    } catch { return 'INR'; }
  });
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(getToday()));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    type: 'expense', description: '', amount: 0, category: 'Food', date: getToday(), note: '',
  });
  const [amountInput, setAmountInput] = useState('');
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); } catch { /* Private browsing may deny storage; in-memory use still works. */ }
  }, [transactions]);
  useEffect(() => {
    try { localStorage.setItem(CURRENCY_KEY, currency); } catch { /* Keep the selected currency for this session. */ }
  }, [currency]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const monthTransactions = useMemo(
    () => transactions.filter((transaction) => monthKey(transaction.date) === selectedMonth),
    [transactions, selectedMonth],
  );
  const expenses = monthTransactions.filter((item) => item.type === 'expense');
  const income = monthTransactions.filter((item) => item.type === 'income');
  const totals = useMemo(() => ({
    expenses: expenses.reduce((sum, item) => sum + item.amount, 0),
    income: income.reduce((sum, item) => sum + item.amount, 0),
  }), [expenses, income]);
  const net = totals.income - totals.expenses;
  const visibleTransactions = useMemo(() => monthTransactions
    .filter((item) => filter === 'all' || item.type === filter)
    .filter((item) => {
      const query = search.trim().toLocaleLowerCase();
      return !query || `${item.description} ${item.category} ${item.note ?? ''}`.toLocaleLowerCase().includes(query);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
  [monthTransactions, filter, search]);
  const categoryTotals = useMemo(() => {
    const result = new Map<string, number>();
    expenses.forEach((item) => result.set(item.category, (result.get(item.category) ?? 0) + item.amount));
    return Array.from(result.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const categories = draft.type === 'expense' ? expenseCategories : incomeCategories;

  function openCreate() {
    setEditingId(null);
    setDraft({ type: 'expense', description: '', amount: 0, category: 'Food', date: getToday(), note: '' });
    setAmountInput('');
    setFormError('');
    setDialogOpen(true);
  }
  function openEdit(transaction: Transaction) {
    setEditingId(transaction.id);
    setDraft({ ...transaction, note: transaction.note ?? '' });
    setAmountInput(String(transaction.amount));
    setFormError('');
    setDialogOpen(true);
  }
  function changeType(type: TransactionType) {
    setDraft((current) => ({ ...current, type, category: type === 'expense' ? 'Food' : 'Salary' }));
  }
  function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(amountInput);
    if (!draft.description.trim()) { setFormError('Give this transaction a short description.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setFormError('Enter an amount greater than zero.'); return; }
    if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) { setFormError('Choose a valid date.'); return; }
    const normalized: Draft = { ...draft, description: draft.description.trim(), amount, note: draft.note?.trim() ?? '' };
    if (editingId) {
      setTransactions((current) => current.map((item) => item.id === editingId ? { ...normalized, id: editingId } : item));
      setToast('Changes saved');
    } else {
      setTransactions((current) => [...current, { ...normalized, id: createId() }]);
      setToast('Added to your notebook');
    }
    setSelectedMonth(monthKey(normalized.date));
    setDialogOpen(false);
  }
  function deleteTransaction(transaction: Transaction) {
    if (!window.confirm(`Delete “${transaction.description}” from your notebook?`)) return;
    setTransactions((current) => current.filter((item) => item.id !== transaction.id));
    setToast('Transaction deleted');
  }
  function exportCsv() {
    if (!transactions.length) { setToast('Add a transaction before exporting'); return; }
    const cells = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Note'], ...transactions
      .slice().sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => [item.date, item.type, item.description, item.category, item.amount.toString(), item.note ?? ''])];
    const csv = cells.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `little-ledger-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast('Your CSV is ready');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Little Ledger home">
          <div className="brand-mark"><BookOpen size={21} strokeWidth={1.8} /></div>
          <div><div className="brand-name">little ledger</div><div className="brand-caption">your personal money notebook</div></div>
        </div>
        <div className="top-actions">
          <div className="privacy-note"><ShieldCheck size={15} /> Private by nature · stored on this device</div>
          <button className="button button-primary" data-testid="button-add-transaction" onClick={openCreate}><Plus size={16} /> Add transaction</button>
        </div>
      </header>

      <section aria-labelledby="month-heading">
        <div className="page-heading">
          <div><div className="eyebrow">A little clarity, every month</div><h1 className="page-title" id="month-heading">Your money, in view.</h1></div>
          <div className="month-controls" aria-label="Choose month">
            <button className="icon-button" aria-label="Previous month" data-testid="button-previous-month" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))}><ChevronLeft size={17} /></button>
            <span className="month-label" data-testid="text-selected-month">{monthLabel(selectedMonth)}</span>
            <button className="icon-button" aria-label="Next month" data-testid="button-next-month" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))}><ChevronRight size={17} /></button>
          </div>
        </div>
        <div className="summary-grid">
          <article className="summary-card featured" data-testid="card-net-total">
            <div className="summary-label"><Wallet size={15} /> Net this month</div>
            <div className="summary-value" data-testid="text-net-total">{formatCurrency(net, currency)}</div>
            <div className="summary-foot">{net >= 0 ? 'Income is ahead of spending' : 'Spending is ahead of income'}</div>
          </article>
          <article className="summary-card" data-testid="card-expenses-total">
            <div className="summary-label"><ArrowUpRight size={15} /> Spent</div>
            <div className="summary-value" data-testid="text-expenses-total">{formatCurrency(totals.expenses, currency)}</div>
            <div className="summary-foot">{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} recorded</div>
          </article>
          <article className="summary-card" data-testid="card-income-total">
            <div className="summary-label"><ArrowDownLeft size={15} /> Received</div>
            <div className="summary-value" data-testid="text-income-total">{formatCurrency(totals.income, currency)}</div>
            <div className="summary-foot">{income.length} {income.length === 1 ? 'income entry' : 'income entries'}</div>
          </article>
        </div>
      </section>

      <div className="content-grid">
        <section className="panel transactions-panel" aria-labelledby="transactions-heading">
          <div className="panel-head">
            <div><h2 className="panel-title" id="transactions-heading">Recent entries</h2><div className="panel-subtitle" data-testid="text-transaction-count">{monthTransactions.length} {monthTransactions.length === 1 ? 'entry' : 'entries'} this month</div></div>
            <div className="head-tools">
              <label className="search-wrap">
                <Search size={14} />
                <input className="search-input" aria-label="Search transactions" placeholder="Find an entry…" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-search-transactions" />
              </label>
              <select className="filter-select" aria-label="Filter transactions by type" value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="select-transaction-filter">
                <option value="all">All types</option><option value="expense">Expenses</option><option value="income">Income</option>
              </select>
            </div>
          </div>
          {monthTransactions.length > 0 && <div className="table-head"><span>Description</span><span>Category</span><span>Date</span><span style={{ textAlign: 'right' }}>Amount</span><span /></div>}
          {visibleTransactions.length ? visibleTransactions.map((transaction) => (
            <article className="transaction-row" key={transaction.id} data-testid={`row-transaction-${transaction.id}`}>
              <div><div className="transaction-title">{transaction.description}</div>{transaction.note && <div className="transaction-note">{transaction.note}</div>}</div>
              <div><span className="category-chip">{transaction.category}</span></div>
              <div className="date-text">{formatDate(transaction.date)}</div>
              <div className={`amount ${transaction.type}`} data-testid={`text-amount-${transaction.id}`}>{transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount, currency)}</div>
              <div className="row-actions">
                <button className="icon-button" aria-label={`Edit ${transaction.description}`} title="Edit entry" data-testid={`button-edit-${transaction.id}`} onClick={() => openEdit(transaction)}><Pencil size={14} /></button>
                <button className="icon-button" aria-label={`Delete ${transaction.description}`} title="Delete entry" data-testid={`button-delete-${transaction.id}`} onClick={() => deleteTransaction(transaction)}><Trash2 size={14} /></button>
              </div>
            </article>
          )) : monthTransactions.length ? (
            <div className="empty-state" data-testid="empty-filter-results"><div className="empty-mark"><Search size={20} /></div><h3 className="empty-title">Nothing found</h3><p className="empty-copy">Try another search or switch the entry filter.</p></div>
          ) : (
            <div className="empty-state" data-testid="empty-month-transactions">
              <div className="empty-mark"><ReceiptText size={21} /></div>
              <h3 className="empty-title">A fresh page.</h3>
              <p className="empty-copy">There are no entries for {monthLabel(selectedMonth)} yet. Add the first one and your month will take shape.</p>
              <button className="button button-primary" onClick={openCreate} data-testid="button-add-first-transaction"><Plus size={15} /> Add your first entry</button>
            </div>
          )}
        </section>

        <aside>
          <section className="panel category-panel" aria-labelledby="category-heading">
            <div><h2 className="panel-title" id="category-heading">Where it went</h2><div className="panel-subtitle">Spending by category</div></div>
            {categoryTotals.length ? (
              <div className="category-list" data-testid="list-category-totals">
                {categoryTotals.map(([name, amount]) => (
                  <div key={name} data-testid={`category-total-${name.toLowerCase()}`}>
                    <div className="category-item-top"><span className="category-name"><span className="category-dot" style={{ '--dot': categoryColors[name] ?? '#8b9a78' } as CSSProperties} />{name}</span><span className="category-amount">{formatCurrency(amount, currency)}</span></div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(3, amount / totals.expenses * 100)}%`, '--dot': categoryColors[name] ?? '#8b9a78' } as CSSProperties} /></div>
                  </div>
                ))}
              </div>
            ) : <div className="category-empty" data-testid="empty-category-totals">Your spending categories will appear here once you add an expense.</div>}
          </section>
          <section className="privacy-card" aria-label="Your privacy">
            <ShieldCheck size={17} />
            <p><strong>Just yours, always.</strong>Your entries stay in this browser. No account, no syncing, no surprises.</p>
          </section>
          <div className="footer-note">
            <div className="currency-wrap">
              <span>Display currency</span>
              <select className="currency-select" aria-label="Display currency" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} data-testid="select-currency">
                {currencies.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </div>
            <button className="button button-quiet" style={{ marginTop: 12, width: '100%' }} onClick={exportCsv} data-testid="button-export-csv"><Download size={14} /> Export all as CSV</button>
          </div>
        </aside>
      </div>
      <div className="footer-note">A quiet place to keep an eye on the little things.</div>

      {dialogOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="transaction-dialog-title" data-testid="dialog-transaction">
            <div className="dialog-head">
              <div><h2 className="dialog-title" id="transaction-dialog-title">{editingId ? 'Edit entry' : 'Add to your ledger'}</h2><p className="dialog-copy">A few details are all you need.</p></div>
              <button className="icon-button" aria-label="Close dialog" onClick={() => setDialogOpen(false)} data-testid="button-close-dialog"><X size={16} /></button>
            </div>
            <form onSubmit={saveTransaction}>
              <div className="form-grid">
                <div className="field span-2">
                  <label>Type</label>
                  <div className="type-toggle" role="group" aria-label="Transaction type">
                    <button type="button" className={draft.type === 'expense' ? 'selected' : ''} aria-pressed={draft.type === 'expense'} onClick={() => changeType('expense')} data-testid="button-type-expense"><ArrowUpRight size={14} /> Expense</button>
                    <button type="button" className={draft.type === 'income' ? 'selected' : ''} aria-pressed={draft.type === 'income'} onClick={() => changeType('income')} data-testid="button-type-income"><ArrowDownLeft size={14} /> Income</button>
                  </div>
                </div>
                <div className="field span-2"><label htmlFor="transaction-description">Description</label><input id="transaction-description" autoFocus placeholder="What was it for?" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={90} data-testid="input-transaction-description" /></div>
                <div className="field"><label htmlFor="transaction-amount">Amount ({currency})</label><input id="transaction-amount" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} data-testid="input-transaction-amount" /></div>
                <div className="field"><label htmlFor="transaction-category">Category</label><select id="transaction-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} data-testid="select-transaction-category">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
                <div className="field span-2"><label htmlFor="transaction-date">Date</label><input id="transaction-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} data-testid="input-transaction-date" /></div>
                <div className="field span-2"><label htmlFor="transaction-note">Note <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>· optional</span></label><textarea id="transaction-note" placeholder="Anything worth remembering…" value={draft.note ?? ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} maxLength={240} data-testid="input-transaction-note" /></div>
                {formError && <div className="form-error" role="alert" data-testid="text-form-error">{formError}</div>}
              </div>
              <div className="dialog-actions"><span /> <div className="dialog-actions-right"><button type="button" className="button button-quiet" onClick={() => setDialogOpen(false)} data-testid="button-cancel-transaction">Cancel</button><button className="button button-primary" type="submit" data-testid="button-save-transaction"><Check size={15} /> {editingId ? 'Save changes' : 'Save entry'}</button></div></div>
            </form>
          </section>
        </div>
      )}
      {toast && <div className="toast-message" role="status" data-testid="status-toast">{toast}</div>}
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;