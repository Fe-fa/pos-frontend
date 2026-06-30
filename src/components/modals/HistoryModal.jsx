import { useState } from 'react';
import { Printer, Search, X, Receipt, FileText, User, Clock, ChevronRight } from 'lucide-react';
import { billingService } from '../../services/billingService';
import { formatDateTime, currency } from '../../utils/helpers';
import { openBillingPrint } from '../../utils/print';

export default function HistoryModal({
    isOpen,
    onClose,
    currentStore,
    printSettings,
    userId,
}) {
    const [billings, setBillings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [printing, setPrinting] = useState(null);
    const [searched, setSearched] = useState(false);

    const handleSearch = async () => {
        if (!search.trim()) return;
        setLoading(true);
        setSearched(true);
        setBillings([]);

        const term = search.trim();
        const isReceipt = /^rec/i.test(term);
        const isInvoice = /^inv/i.test(term);
        const isDocNumber = isReceipt || isInvoice || /^[a-zA-Z]{2,}-?\d+$/i.test(term) || /^\d{4,}$/.test(term);

        try {
            const params = {
                store_id: Number(currentStore.store_id),
                is_draft: false,
                per_page: 5,
                ...(isDocNumber ? { invnumber: term } : { search: term }),
            };

            const res = await billingService.list(params);
            const items = Array.isArray(res?.data?.data)
                ? res.data.data
                : Array.isArray(res?.data)
                    ? res.data
                    : [];

            const tagged = items.map((b) => {
                const receiptMatch = b.payments?.find(
                    (p) => p.receiptnumber?.toLowerCase() === term.toLowerCase()
                );
                return {
                    ...b,
                    _matched_as: receiptMatch ? 'receipt' : 'invoice',
                    _matched_number: receiptMatch ? receiptMatch.receiptnumber : b.invnumber,
                };
            });

            setBillings(tagged);
        } catch {
            setBillings([]);
        } finally {
            setLoading(false);
        }
    };

    const handleReprint = async (billing) => {
        setPrinting(billing.billing_id);
        try {
            const res = await billingService.show(billing.billing_id);
            const detail = res?.data || res;
            const mode = billing._matched_as === 'receipt' ? 'receipt' : 'invoice';
            openBillingPrint(
                { ...detail, store: detail.store || currentStore },
                currentStore,
                mode,
                printSettings
            );
        } catch {
            // ignore
        } finally {
            setPrinting(null);
        }
    };

    const handleClose = () => {
        setSearch('');
        setBillings([]);
        setSearched(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 560,
                    background: 'var(--panel)',
                    borderRadius: 20,
                    overflow: 'hidden',
                    boxShadow: '0 24px 60px rgba(15,23,42,0.22)',
                    border: '1px solid var(--line)',
                    animation: 'modalSlideUp 0.22s ease',
                }}
            >
                {/* ── Header ── */}
                <div style={{
                    background: 'linear-gradient(135deg, #427E97 0%, #0E84C3 60%, #4F8CA6 100%)',
                    padding: '20px 22px 18px',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* decorative circle */}
                    <div style={{
                        position: 'absolute', right: -30, top: -30,
                        width: 120, height: 120, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.08)', pointerEvents: 'none',
                    }} />
                    <div style={{
                        position: 'absolute', left: -20, bottom: -40,
                        width: 100, height: 100, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.06)', pointerEvents: 'none',
                    }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 42, height: 42, borderRadius: 12,
                                background: 'rgba(255,255,255,0.16)',
                                border: '1px solid rgba(255,255,255,0.22)',
                                display: 'grid', placeItems: 'center', color: '#fff',
                                backdropFilter: 'blur(6px)',
                            }}>
                                <Receipt size={20} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                                    Find Receipt / Invoice
                                </h2>
                                <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                                    Search by document number
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            style={{
                                width: 34, height: 34, borderRadius: 10,
                                background: 'rgba(255,255,255,0.14)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: '#fff', cursor: 'pointer',
                                display: 'grid', placeItems: 'center',
                                transition: 'background 0.18s ease',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.24)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* ── Search bar inside header ── */}
                    <div style={{
                        marginTop: 16, display: 'flex', gap: 8, position: 'relative', zIndex: 1,
                    }}>
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                            background: 'rgba(255,255,255,0.95)',
                            border: '1px solid rgba(255,255,255,0.6)',
                            borderRadius: 12, padding: '0 14px',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
                        }}>
                            <Search size={15} color="var(--muted)" style={{ flexShrink: 0 }} />
                            <input
                                style={{
                                    border: 0, outline: 0, background: 'transparent',
                                    color: 'var(--text)', flex: 1, fontSize: '0.9rem',
                                    padding: '12px 0',
                                }}
                                placeholder="UMB-REC/0001.../UMB-INV/001/.."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                autoFocus
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => { setSearch(''); setBillings([]); setSearched(false); }}
                                    style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleSearch}
                            disabled={loading || !search.trim()}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '0 18px', borderRadius: 12, fontWeight: 700,
                                fontSize: '0.88rem', border: 'none', cursor: 'pointer',
                                background: loading || !search.trim() ? 'rgba(255,255,255,0.4)' : '#FA7316',
                                color: loading || !search.trim() ? 'rgba(255,255,255,0.6)' : '#fff',
                                whiteSpace: 'nowrap',
                                boxShadow: loading || !search.trim() ? 'none' : '0 4px 12px rgba(250,115,22,0.35)',
                                transition: 'all 0.18s ease',
                            }}
                        >
                            <Search size={15} />
                            {loading ? 'Searching…' : 'Search'}
                        </button>
                    </div>

                    {/* ── Quick hint chips ── */}
                    <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                        {['Invoice no.', 'Receipt no.'].map((hint) => (
                            <span key={hint} style={{
                                fontSize: '0.72rem', fontWeight: 600, padding: '3px 9px',
                                borderRadius: 999, background: 'rgba(255,255,255,0.14)',
                                border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)',
                            }}>{hint}</span>
                        ))}
                    </div>
                </div>

                {/* ── Body ── */}
                <div style={{ padding: '16px 20px 20px', maxHeight: 420, overflowY: 'auto' }}>
                    {!searched ? (
                        <div style={{ textAlign: 'center', padding: '32px 20px' }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 16,
                                background: 'var(--input-bg)', border: '1px solid var(--line)',
                                display: 'grid', placeItems: 'center',
                                margin: '0 auto 14px', color: 'var(--muted)',
                            }}>
                                <Search size={24} />
                            </div>
                            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600 }}>
                                Enter a search term to find documents
                            </p>
                            <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                                Search by invoice/receipt number
                            </p>
                        </div>
                    ) : loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '36px 0' }}>
                            <div className="spinner" />
                            <span style={{ color: 'var(--muted)', fontSize: '0.84rem' }}>Searching across all cashiers…</span>
                        </div>
                    ) : !billings.length ? (
                        <div style={{ textAlign: 'center', padding: '32px 20px' }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 16,
                                background: '#fde8e8', border: '1px solid #f5c2c2',
                                display: 'grid', placeItems: 'center',
                                margin: '0 auto 14px', color: 'var(--danger)',
                            }}>
                                <FileText size={24} />
                            </div>
                            <p style={{ margin: 0, color: 'var(--text)', fontSize: '0.9rem', fontWeight: 700 }}>
                                No results found
                            </p>
                            <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
                                No documents matched "<strong>{search}</strong>"
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {billings.length} result{billings.length !== 1 ? 's' : ''} found
                            </p>
                            {billings.map((b) => {
                                const isReceipt = b._matched_as === 'receipt';
                                const isPaid = b.status === 'paid';
                                const isPartial = b.status === 'partial';

                                return (
                                    <div
                                        key={b.billing_id}
                                        style={{
                                            border: `1.5px solid ${isReceipt ? '#cfe7fb' : 'var(--line)'}`,
                                            borderRadius: 14,
                                            background: isReceipt ? '#f7fbff' : 'var(--panel)',
                                            overflow: 'hidden',
                                            boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                                            transition: 'all 0.18s ease',
                                        }}
                                    >
                                        {/* Doc type stripe */}
                                        <div style={{
                                            height: 3,
                                            background: isReceipt
                                                ? 'linear-gradient(90deg, #427E97, #0E84C3)'
                                                : 'linear-gradient(90deg, #FA7316, #E36925)',
                                        }} />

                                        <div style={{ padding: '14px 16px' }}>
                                            {/* Top row */}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                                                    {/* Doc type icon + badge */}
                                                    <div style={{
                                                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                                                        background: isReceipt ? '#eef8fe' : '#fff4eb',
                                                        border: `1px solid ${isReceipt ? '#cfe7fb' : '#ffd3b0'}`,
                                                        display: 'grid', placeItems: 'center',
                                                        color: isReceipt ? 'var(--brand-blue)' : 'var(--brand-orange)',
                                                    }}>
                                                        {isReceipt ? <Receipt size={14} /> : <FileText size={14} />}
                                                    </div>

                                                    <strong style={{ fontSize: '0.95rem', color: 'var(--text)', letterSpacing: '-0.01em' }}>
                                                        {b._matched_number || b.invnumber || `#${b.billing_id}`}
                                                    </strong>

                                                    <span style={{
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                        padding: '3px 8px', borderRadius: 999,
                                                        background: isReceipt ? '#eef8fe' : '#fff4eb',
                                                        color: isReceipt ? 'var(--brand-blue)' : 'var(--brand-orange)',
                                                        border: `1px solid ${isReceipt ? '#cfe7fb' : '#ffd3b0'}`,
                                                    }}>
                                                        {isReceipt ? 'Receipt' : 'Invoice'}
                                                    </span>

                                                    <span style={{
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                        padding: '3px 8px', borderRadius: 999,
                                                        background: isPaid ? '#e2f5ec' : isPartial ? '#fff5e7' : '#fde8e8',
                                                        color: isPaid ? '#218353' : isPartial ? '#b56d00' : '#b02525',
                                                        border: `1px solid ${isPaid ? '#c3edd7' : isPartial ? '#f2ddb2' : '#f5c2c2'}`,
                                                    }}>
                                                        {b.status}
                                                    </span>
                                                </div>

                                                {/* Amount */}
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <strong style={{ fontSize: '1.05rem', color: 'var(--hero-orange-2)', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                                        {currency(b.total, currentStore?.currency)}
                                                    </strong>
                                                </div>
                                            </div>

                                            {/* Meta row */}
                                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                                {b.customer?.full_name && (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'var(--muted)' }}>
                                                        <User size={12} />
                                                        {b.customer.full_name}
                                                    </span>
                                                )}
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: 'var(--muted)' }}>
                                                    <Clock size={12} />
                                                    {formatDateTime(b.billing_date || b.created_at)}
                                                </span>
                                            </div>

                                            {/* Action */}
                                            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleReprint(b)}
                                                    disabled={printing === b.billing_id}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 7,
                                                        padding: '9px 16px', borderRadius: 10, fontWeight: 700,
                                                        fontSize: '0.84rem', cursor: 'pointer',
                                                        border: `1px solid ${isReceipt ? '#cfe7fb' : '#ffd3b0'}`,
                                                        background: isReceipt ? '#eef8fe' : '#fff4eb',
                                                        color: isReceipt ? 'var(--brand-blue)' : 'var(--brand-orange)',
                                                        opacity: printing === b.billing_id ? 0.6 : 1,
                                                        transition: 'all 0.18s ease',
                                                        boxShadow: '0 2px 6px rgba(15,23,42,0.06)',
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (printing !== b.billing_id) {
                                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.1)';
                                                        }
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(15,23,42,0.06)';
                                                    }}
                                                >
                                                    <Printer size={14} />
                                                    {printing === b.billing_id ? 'Printing…' : `Reprint ${isReceipt ? 'Receipt' : 'Invoice'}`}
                                                    <ChevronRight size={13} style={{ opacity: 0.6 }} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}