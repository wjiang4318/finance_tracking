/**
 * Single source of truth for "what counts as spending." Used by the dashboard, trends,
 * and transactions pages so they always agree.
 *
 * Amounts are stored unsigned, with direction in the `type` column, so spend math reads
 * `type` rather than the sign.
 */

export const TRANSFER_CATEGORIES = [
  'Income',
  'Investment',
  'Internal Transfers',
  'Credit Card Payment',
]

export type SpendRow = {
  amount: number
  category: string
  type?: string
}

/** Whether this transaction participates in spending totals at all (either direction). */
export function countsTowardSpend(tx: SpendRow): boolean {
  return !TRANSFER_CATEGORIES.includes(tx.category)
}

/** True for a refund/return — money coming back on a spend category. */
export function isRefund(tx: SpendRow): boolean {
  return countsTowardSpend(tx) && (tx.type === 'credit' || tx.amount < 0)
}

/**
 * Signed contribution to spending: purchases add, refunds subtract, transfers are zero.
 * Handles both uploaded rows (direction in `type`) and manually-added rows (signed amount).
 */
export function spendAmount(tx: SpendRow): number {
  if (!countsTowardSpend(tx)) return 0
  return isRefund(tx) ? -Math.abs(tx.amount) : Math.abs(tx.amount)
}

/** Total spending across rows, rounded to cents. */
export function sumSpend(txs: SpendRow[]): number {
  return Math.round(txs.reduce((sum, tx) => sum + spendAmount(tx), 0) * 100) / 100
}
