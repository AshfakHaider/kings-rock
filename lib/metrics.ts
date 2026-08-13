import type {
  AdvanceTransaction,
  Expense,
  GmailAccount,
  SoldAccount,
  StockAccount
} from "@/lib/types";
import { canonicalSaleSource, canonicalSaleSourceKey } from "@/lib/sale-sources";

export function getProfit(sale: SoldAccount) {
  return Number(sale.sold_amount) - Number(sale.stock_account?.buying_price ?? 0);
}

export function isPaidSale(sale: SoldAccount) {
  return sale.payment_status === "paid";
}

export function paidSales(sales: SoldAccount[]) {
  return sales.filter(isPaidSale);
}

export function saleCashDate(sale: SoldAccount) {
  return sale.payment_received_date ?? sale.sold_date;
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
  const receivedSales = paidSales(soldAccounts);
  const waitingSales = soldAccounts.filter((sale) => !isPaidSale(sale));

  const soldBuyingCost = receivedSales.reduce(
    (total, sale) => total + Number(sale.stock_account?.buying_price ?? 0),
    0
  );
  const totalSalesAmount = receivedSales.reduce(
    (total, sale) => total + Number(sale.sold_amount),
    0
  );
  const waitingPaymentAmount = waitingSales.reduce((total, sale) => total + Number(sale.sold_amount), 0);
  const totalExpenses = expenses.reduce((total, expense) => total + Number(expense.amount), 0);
  const grossProfit = totalSalesAmount - soldBuyingCost;

  const monthlyProfit = receivedSales
    .filter((sale) => {
      const date = new Date(saleCashDate(sale));
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
    })
    .reduce((total, sale) => total + getProfit(sale), 0);

  const yearlyProfit = receivedSales
    .filter((sale) => new Date(saleCashDate(sale)).getFullYear() === thisYear)
    .reduce((total, sale) => total + getProfit(sale), 0);

  return {
    totalStockAccounts: stockAccounts.filter((account) => account.status !== "sold").length,
    totalStockBuyingValue: stockAccounts
      .filter((account) => account.status !== "sold")
      .reduce((total, account) => total + Number(account.buying_price), 0),
    totalStockSellingValue: stockAccounts
      .filter((account) => account.status !== "sold")
      .reduce((total, account) => total + Number(account.selling_price ?? 0), 0),
    totalSoldAccounts: receivedSales.length,
    totalSalesAmount,
    waitingPaymentCount: waitingSales.length,
    waitingPaymentAmount,
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

  for (const sale of paidSales(sales)) {
    const date = new Date(saleCashDate(sale));
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
  for (const sale of paidSales(sales)) {
    const name = sale.employee?.name ?? "Unknown";
    const item = buckets.get(name) ?? { name, profit: 0, sales: 0 };
    item.profit += getProfit(sale);
    item.sales += Number(sale.sold_amount);
    buckets.set(name, item);
  }
  return Array.from(buckets.values());
}

export function salesBySource(sales: SoldAccount[]) {
  const buckets = new Map<string, { source: string; soldCount: number; totalSales: number; profit: number }>();

  for (const sale of paidSales(sales)) {
    const source = canonicalSaleSource(sale.sold_source_website);
    const key = canonicalSaleSourceKey(source);
    const item = buckets.get(key) ?? {
      source,
      soldCount: 0,
      totalSales: 0,
      profit: 0
    };

    item.soldCount += 1;
    item.totalSales += Number(sale.sold_amount);
    item.profit += getProfit(sale);
    buckets.set(key, item);
  }

  return Array.from(buckets.values()).sort((a, b) => b.soldCount - a.soldCount || b.totalSales - a.totalSales);
}

export function soldQuantityByGame(sales: SoldAccount[]) {
  const buckets = new Map<string, { game: string; count: number }>();

  for (const sale of paidSales(sales)) {
    const game = sale.stock_account?.game_name?.trim() || "Unknown";
    const item = buckets.get(game.toLowerCase()) ?? { game, count: 0 };
    item.count += 1;
    buckets.set(game.toLowerCase(), item);
  }

  return Array.from(buckets.values());
}

export function soldValueByGame(sales: SoldAccount[]) {
  const buckets = new Map<string, { game: string; value: number }>();

  for (const sale of paidSales(sales)) {
    const game = sale.stock_account?.game_name?.trim() || "Unknown";
    const item = buckets.get(game.toLowerCase()) ?? { game, value: 0 };
    item.value += Number(sale.sold_amount);
    buckets.set(game.toLowerCase(), item);
  }

  return Array.from(buckets.values());
}

export function gameSalesSummary(sales: SoldAccount[]) {
  const buckets = new Map<
    string,
    {
      game: string;
      paidCount: number;
      paidValue: number;
      waitingCount: number;
      waitingValue: number;
      buyingCost: number;
      profit: number;
      averagePaidSale: number;
    }
  >();

  for (const sale of sales) {
    const game = sale.stock_account?.game_name?.trim() || "Unknown";
    const key = game.toLowerCase();
    const item = buckets.get(key) ?? {
      game,
      paidCount: 0,
      paidValue: 0,
      waitingCount: 0,
      waitingValue: 0,
      buyingCost: 0,
      profit: 0,
      averagePaidSale: 0
    };

    if (isPaidSale(sale)) {
      item.paidCount += 1;
      item.paidValue += Number(sale.sold_amount);
      item.buyingCost += Number(sale.stock_account?.buying_price ?? 0);
      item.profit += getProfit(sale);
    } else {
      item.waitingCount += 1;
      item.waitingValue += Number(sale.sold_amount);
    }

    item.averagePaidSale = item.paidCount > 0 ? item.paidValue / item.paidCount : 0;
    buckets.set(key, item);
  }

  return Array.from(buckets.values()).sort(
    (a, b) =>
      b.paidCount + b.waitingCount - (a.paidCount + a.waitingCount) ||
      b.paidValue + b.waitingValue - (a.paidValue + a.waitingValue)
  );
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

export function stockQuantityByGame(stockAccounts: StockAccount[]) {
  const buckets = new Map<string, { game: string; count: number }>();
  for (const account of stockAccounts.filter((item) => item.status !== "sold")) {
    const item = buckets.get(account.game_name) ?? { game: account.game_name, count: 0 };
    item.count += 1;
    buckets.set(account.game_name, item);
  }
  return Array.from(buckets.values());
}
