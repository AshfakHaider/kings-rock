import type {
  AdvanceTransaction,
  Expense,
  GmailAccount,
  SoldAccount,
  StockAccount
} from "@/lib/types";

export function getProfit(sale: SoldAccount) {
  return Number(sale.sold_amount) - Number(sale.stock_account?.buying_price ?? 0);
}

export function getAdvanceBalance(transactions: AdvanceTransaction[]) {
  return transactions.reduce((total, transaction) => {
    if (transaction.type === "money_given") return total + Number(transaction.amount);
    if (transaction.type === "account_purchase") return total - Number(transaction.amount);
    if (transaction.type === "money_returned") return total - Number(transaction.amount);
    return total + Number(transaction.amount);
  }, 0);
}

export function getDashboardMetrics(input: {
  stockAccounts: StockAccount[];
  soldAccounts: SoldAccount[];
  gmailAccounts: GmailAccount[];
  expenses: Expense[];
  advanceTransactions: AdvanceTransaction[];
}) {
  const { stockAccounts, soldAccounts, gmailAccounts, expenses, advanceTransactions } = input;
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const soldBuyingCost = soldAccounts.reduce(
    (total, sale) => total + Number(sale.stock_account?.buying_price ?? 0),
    0
  );
  const totalSalesAmount = soldAccounts.reduce(
    (total, sale) => total + Number(sale.sold_amount),
    0
  );
  const totalExpenses = expenses.reduce((total, expense) => total + Number(expense.amount), 0);
  const grossProfit = totalSalesAmount - soldBuyingCost;

  const monthlyProfit = soldAccounts
    .filter((sale) => {
      const date = new Date(sale.sold_date);
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
    })
    .reduce((total, sale) => total + getProfit(sale), 0);

  const yearlyProfit = soldAccounts
    .filter((sale) => new Date(sale.sold_date).getFullYear() === thisYear)
    .reduce((total, sale) => total + getProfit(sale), 0);

  return {
    totalStockAccounts: stockAccounts.filter((account) => account.status !== "sold").length,
    totalStockBuyingValue: stockAccounts
      .filter((account) => account.status !== "sold")
      .reduce((total, account) => total + Number(account.buying_price), 0),
    totalSoldAccounts: soldAccounts.length,
    totalSalesAmount,
    totalBuyingCost: soldBuyingCost,
    totalGrossProfit: grossProfit,
    totalExpenses,
    netProfit: grossProfit - totalExpenses,
    monthlyProfit,
    yearlyProfit,
    availableGmailCount: gmailAccounts.filter((gmail) => gmail.status === "fresh").length,
    usedGmailCount: gmailAccounts.filter((gmail) => gmail.status === "used").length,
    employeeAdvanceBalance: getAdvanceBalance(advanceTransactions)
  };
}

export function monthlySeries(sales: SoldAccount[]) {
  const buckets = new Map<string, { month: string; sales: number; profit: number }>();

  for (const sale of sales) {
    const date = new Date(sale.sold_date);
    const month = date.toLocaleString("en", { month: "short" });
    const item = buckets.get(month) ?? { month, sales: 0, profit: 0 };
    item.sales += Number(sale.sold_amount);
    item.profit += getProfit(sale);
    buckets.set(month, item);
  }

  return Array.from(buckets.values());
}

export function employeeProfitSeries(sales: SoldAccount[]) {
  const buckets = new Map<string, { name: string; profit: number; sales: number }>();
  for (const sale of sales) {
    const name = sale.employee?.name ?? "Unknown";
    const item = buckets.get(name) ?? { name, profit: 0, sales: 0 };
    item.profit += getProfit(sale);
    item.sales += Number(sale.sold_amount);
    buckets.set(name, item);
  }
  return Array.from(buckets.values());
}

export function stockValueByGame(stockAccounts: StockAccount[]) {
  const buckets = new Map<string, { game: string; value: number }>();
  for (const account of stockAccounts.filter((item) => item.status !== "sold")) {
    const item = buckets.get(account.game_name) ?? { game: account.game_name, value: 0 };
    item.value += Number(account.buying_price);
    buckets.set(account.game_name, item);
  }
  return Array.from(buckets.values());
}
