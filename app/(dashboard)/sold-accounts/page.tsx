import { deleteSale, markSalePaid } from "@/app/actions";
import { AutoSubmitSelect } from "@/components/modules/auto-submit-select";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_PAGE_SIZE, getCurrentProfile, getSettings, getSoldAccounts, getSoldAccountsPage } from "@/lib/data";
import { gameSalesSummary, getProfit, isPaidSale, salesBySource } from "@/lib/metrics";
import { canonicalSaleSource } from "@/lib/sale-sources";
import { stockDisplayTitle } from "@/lib/stock-title";
import { formatDate, money } from "@/lib/utils";

function uniqueGameOptions(...groups: Array<Array<string | null | undefined>>) {
  return Array.from(
    new Set(
      groups
        .flat()
        .map((game) => game?.trim())
        .filter((game): game is string => Boolean(game))
    )
  ).sort((a, b) => a.localeCompare(b));
}

export default async function SoldAccountsPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string; sort?: string; game?: string }> }) {
  const params = (await searchParams) ?? {};
  const page = Number(params.page ?? 1);
  const sort = params.sort === "oldest" ? "oldest" : "recent";
  const gameFilter = params.game?.trim() || null;
  const [settings, allSoldAccounts, currentProfile] = await Promise.all([
    getSettings(),
    getSoldAccounts(),
    getCurrentProfile()
  ]);
  const canViewProfit = currentProfile.role !== "employee";
  const canDeleteSales = currentProfile.role !== "employee";
  const soldAccounts =
    currentProfile.role === "employee"
      ? allSoldAccounts.filter((sale) => sale.employee_id === currentProfile.id)
      : allSoldAccounts;
  const gameOptions = uniqueGameOptions(
    settings.game_categories,
    soldAccounts.map((sale) => sale.stock_account?.game_name)
  );
  const filteredSoldAccounts = gameFilter
    ? soldAccounts.filter((sale) => sale.stock_account?.game_name === gameFilter)
    : soldAccounts;
  const [soldPage, waitingPage] = await Promise.all([
    getSoldAccountsPage({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      q: params.q,
      employeeId: currentProfile.role === "employee" ? currentProfile.id : null,
      gameName: gameFilter,
      sort
    }),
    getSoldAccountsPage({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      q: params.q,
      employeeId: currentProfile.role === "employee" ? currentProfile.id : null,
      gameName: gameFilter,
      paymentStatus: "not_paid",
      sort
    })
  ]);
  const waitingSoldAccounts = waitingPage.rows;
  const sourceRows = salesBySource(filteredSoldAccounts);
  const gameSummaryRows = gameSalesSummary(filteredSoldAccounts);
  type SoldRow = (typeof soldPage.rows)[number];
  const toolbarClassName = "rounded-lg border bg-card p-4 shadow-soft sm:grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_auto]";
  const additionalQuery = { sort, game: gameFilter };

  function renderFilters(idPrefix: string) {
    return (
      <>
        <div className="min-w-0">
          <AutoSubmitSelect id={`${idPrefix}_game`} name="game" defaultValue={gameFilter ?? ""} aria-label="Game filter">
            <option value="">All games</option>
            {gameOptions.map((game) => (
              <option key={game} value={game}>
                {game}
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <div className="min-w-0">
          <AutoSubmitSelect id={`${idPrefix}_sort`} name="sort" defaultValue={sort} aria-label="Date filter">
            <option value="recent">Recent to old</option>
            <option value="oldest">Old to recent</option>
          </AutoSubmitSelect>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sold Accounts"
        description={
          canViewProfit
            ? "Complete sold account history. Profit counts only after payment is marked paid."
            : "Your sold account history with sale amount, source, and date."
        }
      />
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Waiting For Payment</h2>
          <p className="text-sm text-muted-foreground">Sold accounts waiting for platform payout.</p>
        </div>
        <ResponsiveTable
          rows={waitingSoldAccounts}
          searchQuery={params.q}
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          totalRows={waitingPage.total}
          serverSide
          additionalQuery={additionalQuery}
          skipHiddenQueryKeys={["sort", "game"]}
          toolbarClassName={toolbarClassName}
          searchPlaceholder="Search by game, title, secret code, employee..."
          filters={renderFilters("waiting_sales")}
          emptyTitle="No waiting payments"
          emptyDescription="Newly sold accounts will appear here until payment is received."
          columns={[
            {
              key: "account",
              header: "Account",
              cell: (row) => stockDisplayTitle(row.stock_account?.secret_code, row.stock_account?.account_title ?? row.stock_account_id),
              searchValue: (row) => `${row.stock_account?.secret_code ?? ""} ${row.stock_account?.account_title ?? ""}`
            },
            { key: "employee", header: "Sold by", cell: (row) => row.employee?.name ?? row.employee_id, searchValue: (row) => row.employee?.name ?? row.employee_id },
            { key: "amount", header: "Amount", cell: (row) => money(row.sold_amount, settings.currency) },
            { key: "source", header: "Source", cell: (row) => canonicalSaleSource(row.sold_source_website), searchValue: (row) => canonicalSaleSource(row.sold_source_website) },
            { key: "date", header: "Sold date", cell: (row) => formatDate(row.sold_date) },
            {
              key: "action",
              header: "Action",
              cell: (row: SoldRow) => (
                <form action={markSalePaid}>
                  <input type="hidden" name="id" value={row.id} />
                  <Button size="sm">Mark paid</Button>
                </form>
              )
            }
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Game Sales Summary</h2>
          <p className="text-sm text-muted-foreground">
            Paid value is received money. Waiting value is platform payout not received yet.
          </p>
        </div>
        <ResponsiveTable
          rows={gameSummaryRows}
          paginate={false}
          searchPlaceholder="Search games..."
          emptyTitle="No game sales yet"
          emptyDescription="When accounts are sold, game totals will appear here."
          columns={[
            { key: "game", header: "Game", cell: (row) => row.game, searchValue: (row) => row.game },
            { key: "paidCount", header: "Paid sold", cell: (row) => row.paidCount },
            { key: "paidValue", header: "Paid sold value", cell: (row) => money(row.paidValue, settings.currency) },
            { key: "waitingCount", header: "Waiting", cell: (row) => row.waitingCount },
            { key: "waitingValue", header: "Waiting value", cell: (row) => money(row.waitingValue, settings.currency) },
            ...(canViewProfit
              ? [
                  { key: "buyingCost", header: "Buying cost", cell: (row: (typeof gameSummaryRows)[number]) => money(row.buyingCost, settings.currency) },
                  { key: "profit", header: "Profit", cell: (row: (typeof gameSummaryRows)[number]) => money(row.profit, settings.currency) }
                ] as const
              : []),
            { key: "averagePaidSale", header: "Avg paid sale", cell: (row) => money(row.averagePaidSale, settings.currency) }
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Paid Sales by Source</h2>
          <p className="text-sm text-muted-foreground">Only paid sales are included in these totals.</p>
        </div>
        <ResponsiveTable
          rows={sourceRows}
          page={Number(params.page ?? 1)}
          searchPlaceholder="Search sale sources..."
          emptyTitle="No source sales yet"
          emptyDescription="When accounts are sold, source totals will appear here."
          columns={[
            { key: "source", header: "Source", cell: (row) => row.source, searchValue: (row) => row.source },
            { key: "count", header: "Accounts sold", cell: (row) => row.soldCount },
            { key: "sales", header: "Total sales", cell: (row) => money(row.totalSales, settings.currency) },
            ...(canViewProfit
              ? [{ key: "profit", header: "Profit", cell: (row: (typeof sourceRows)[number]) => money(row.profit, settings.currency) } as const]
              : [])
          ]}
        />
      </section>

      <ResponsiveTable
        rows={soldPage.rows}
        searchQuery={params.q}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        totalRows={soldPage.total}
        serverSide
        additionalQuery={additionalQuery}
        skipHiddenQueryKeys={["sort", "game"]}
        toolbarClassName={toolbarClassName}
        searchPlaceholder="Search by game, title, secret code, employee..."
        filters={renderFilters("sold_sales")}
        columns={[
          {
            key: "account",
            header: "Account",
            cell: (row) => (
              <div>
                <p className="truncate font-medium">
                  {stockDisplayTitle(row.stock_account?.secret_code, row.stock_account?.account_title ?? row.stock_account_id)}
                </p>
                <p className="text-xs text-muted-foreground">{row.stock_account?.game_name ?? "-"}</p>
              </div>
            ),
            searchValue: (row) => `${row.stock_account?.secret_code ?? ""} ${row.stock_account?.account_title ?? ""} ${row.stock_account?.game_name ?? ""}`
          },
          {
            key: "employee",
            header: "Sold by",
            cell: (row) => (
              <div>
                <p className="font-medium">{row.employee?.name ?? "Unknown employee"}</p>
                <p className="text-xs text-muted-foreground">{row.employee?.email ?? row.employee_id}</p>
              </div>
            ),
            searchValue: (row) => `${row.employee?.name ?? ""} ${row.employee?.email ?? ""} ${row.employee_id}`
          },
          { key: "amount", header: "Sold amount", cell: (row) => money(row.sold_amount, settings.currency) },
          ...(canViewProfit
            ? [{ key: "profit", header: "Profit", cell: (row: SoldRow) => isPaidSale(row) ? money(getProfit(row), settings.currency) : "Waiting payment" } as const]
            : []),
          { key: "source", header: "Source", cell: (row) => canonicalSaleSource(row.sold_source_website), searchValue: (row) => canonicalSaleSource(row.sold_source_website) },
          { key: "payment", header: "Payment", cell: (row) => <StatusBadge value={row.payment_status} />, searchValue: (row) => row.payment_status },
          { key: "date", header: "Sold date", cell: (row) => formatDate(row.sold_date) },
          { key: "paidDate", header: "Paid date", cell: (row) => row.payment_received_date ? formatDate(row.payment_received_date) : "-" },
          ...(!canDeleteSales
            ? [{
                key: "actions",
                header: "Actions",
                cell: (row: SoldRow) => !isPaidSale(row) ? (
                  <form action={markSalePaid}>
                    <input type="hidden" name="id" value={row.id} />
                    <Button size="sm">Mark paid</Button>
                  </form>
                ) : "-"
              } as const]
            : [{
                key: "actions",
                header: "Actions",
                cell: (row: SoldRow) => (
                  <div className="flex flex-wrap gap-2">
                    {!isPaidSale(row) ? (
                      <form action={markSalePaid}>
                        <input type="hidden" name="id" value={row.id} />
                        <Button size="sm">Mark paid</Button>
                      </form>
                    ) : null}
                    <form action={deleteSale}>
                      <input type="hidden" name="id" value={row.id} />
                      <DeleteButton label="Delete" />
                    </form>
                  </div>
                )
              } as const])
        ]}
      />
    </>
  );
}
