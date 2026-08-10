import { deleteStockAccount } from "@/app/actions";
import type React from "react";
import { AutoSubmitSelect } from "@/components/modules/auto-submit-select";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { AssignmentSelect } from "@/components/stock/assignment-select";
import { CopyStockTitleButton } from "@/components/stock/copy-stock-title-button";
import { StockAccountModal } from "@/components/stock/stock-account-modal";
import { assignedEmployeeNames, DEFAULT_PAGE_SIZE, getCurrentProfile, getProfiles, getSettings, getStockAccountsPage, getStockGameNames, getStockTotals, isAccountAssignedTo } from "@/lib/data";
import { stockDisplayTitle } from "@/lib/stock-title";
import type { StockAccount } from "@/lib/types";
import { formatDate, money } from "@/lib/utils";
import Link from "next/link";

function DetailLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block rounded-md p-1 -m-1 hover:bg-muted">
      {children}
    </Link>
  );
}

function withoutImages<T extends { image_url?: string | null; image_urls?: string[] | null }>(account: T) {
  return {
    ...account,
    image_url: null,
    image_urls: []
  };
}

function withPrivateNotesForCurrentUser<T extends Pick<StockAccount, "assigned_employee_id" | "assignments" | "notes">>(
  account: T,
  currentProfileId: string,
  isAdmin: boolean
) {
  if (isAdmin || isAccountAssignedTo(account, currentProfileId)) return account;
  return { ...account, notes: null };
}

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

export default async function StockAccountsPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string; sort?: string; game?: string }> }) {
  const params = (await searchParams) ?? {};
  const page = Number(params.page ?? 1);
  const sort = params.sort === "oldest" ? "oldest" : "recent";
  const gameFilter = params.game?.trim() || null;
  const [settings, currentProfile] = await Promise.all([getSettings(), getCurrentProfile()]);
  const [stockPageResult, stockTotalsResult, profilesResult, stockGameNamesResult] = await Promise.allSettled([
    getStockAccountsPage({ page, pageSize: DEFAULT_PAGE_SIZE, q: params.q, excludeSold: true, sort, gameName: gameFilter }),
    getStockTotals({ excludeSold: true }),
    getProfiles(),
    getStockGameNames({ excludeSold: true })
  ]);
  const stockPage =
    stockPageResult.status === "fulfilled"
      ? stockPageResult.value
      : { rows: [], total: 0 };
  const stockTotals =
    stockTotalsResult.status === "fulfilled"
      ? stockTotalsResult.value
      : { availableCount: 0, assignedCount: 0, activeCount: 0, buyingValue: 0, sellingValue: 0 };
  const profiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];
  const stockGameNames = stockGameNamesResult.status === "fulfilled" ? stockGameNamesResult.value : [];
  const stockLoadError =
    stockPageResult.status === "rejected" || stockTotalsResult.status === "rejected" || profilesResult.status === "rejected" || stockGameNamesResult.status === "rejected";
  const gameOptions = uniqueGameOptions(settings.game_categories, stockGameNames);
  const visibleStockAccounts = stockPage.rows;
  const employees = profiles.filter((profile) => profile.role !== "admin" && profile.status === "active");
  const canViewBuyingPrice = currentProfile.role !== "employee";
  const canManageStockRecords = currentProfile.role !== "employee";
  const totalAvailable = stockTotals.availableCount;
  const totalAssigned = stockTotals.assignedCount;
  const totalActive = stockTotals.activeCount;
  const stockValue = stockTotals.buyingValue;
  const stockSellingValue = stockTotals.sellingValue;
  const stockSummary = `${totalAvailable} available, ${totalAssigned} assigned, ${totalActive} total available + assigned.`;
  type StockRow = (typeof visibleStockAccounts)[number];

  return (
    <>
      <PageHeader
        title="Stock Accounts"
        description={
          canViewBuyingPrice
            ? `${stockSummary} Buying value ${money(stockValue, settings.currency)}. Selling value ${money(stockSellingValue, settings.currency)}.`
            : `${stockSummary} Selling value ${money(stockSellingValue, settings.currency)}.`
        }
        action={
          <StockAccountModal
            employees={profiles.filter((profile) => profile.role !== "admin")}
            gameCategories={settings.game_categories}
            canViewBuyingPrice={canViewBuyingPrice}
            currentProfileId={currentProfile.id}
            isAdmin={currentProfile.role === "admin"}
            canAssignAnyEmployee={currentProfile.role !== "employee"}
          />
        }
      />
      {stockLoadError ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Stock data could not fully refresh. Please reload once; if it repeats, check the latest Vercel function log for the exact Supabase error.
        </div>
      ) : null}
      <ResponsiveTable
        rows={visibleStockAccounts}
        searchQuery={params.q}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        totalRows={stockPage.total}
        serverSide
        additionalQuery={{ sort, game: gameFilter }}
        skipHiddenQueryKeys={["sort", "game"]}
        toolbarClassName="rounded-lg border bg-card p-4 shadow-soft sm:grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_auto]"
        searchPlaceholder="Search by game, title, secret code, employee..."
        filters={
          <>
            <div className="min-w-0">
              <AutoSubmitSelect id="stock_game" name="game" defaultValue={gameFilter ?? ""} aria-label="Game filter">
                <option value="">All games</option>
                {gameOptions.map((game) => (
                  <option key={game} value={game}>
                    {game}
                  </option>
                ))}
              </AutoSubmitSelect>
            </div>
            <div className="min-w-0">
              <AutoSubmitSelect id="stock_sort" name="sort" defaultValue={sort} aria-label="Date filter">
                <option value="recent">Recent to old</option>
                <option value="oldest">Old to recent</option>
              </AutoSubmitSelect>
            </div>
          </>
        }
        columns={[
          {
            key: "title",
            header: "Account",
            cell: (row) => (
              <div className="flex w-full min-w-0 items-start justify-end gap-2">
                <div className="min-w-0 flex-1">
                  <DetailLink href={`/stock-accounts/${row.id}`}>
                    <p className="truncate font-medium text-primary">
                      {stockDisplayTitle(row.secret_code, row.account_title)}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.game_name}</p>
                  </DetailLink>
                </div>
                <CopyStockTitleButton title={stockDisplayTitle(row.secret_code, row.account_title)} />
              </div>
            ),
            searchValue: (row) => `${row.account_title} ${row.game_name} ${row.secret_code ?? ""} ${assignedEmployeeNames(row).join(" ")}`
          },
          ...(canViewBuyingPrice
            ? [{
                key: "price",
                header: "Buying price",
                cell: (row: StockRow) => <DetailLink href={`/stock-accounts/${row.id}`}>{money(row.buying_price, settings.currency)}</DetailLink>
              } as const]
            : []),
          {
            key: "selling",
            header: "Selling price",
            cell: (row) => <DetailLink href={`/stock-accounts/${row.id}`}>{money(row.selling_price, settings.currency)}</DetailLink>
          },
          {
            key: "date",
            header: "Purchase date",
            cell: (row) => <DetailLink href={`/stock-accounts/${row.id}`}>{formatDate(row.purchase_date)}</DetailLink>
          },
          {
            key: "employee",
            header: "Assigned",
            cell: (row) => (
              <AssignmentSelect
                account={withoutImages(row)}
                employees={employees}
                currentProfile={currentProfile}
              />
            ),
            searchValue: (row) => assignedEmployeeNames(row).join(" ") || "Available"
          },
          {
            key: "status",
            header: "Status",
            cell: (row) => <DetailLink href={`/stock-accounts/${row.id}`}><StatusBadge value={row.status} /></DetailLink>,
            searchValue: (row) => row.status
          },
          ...(canManageStockRecords
            ? [{
                key: "actions",
                header: "Actions",
                cell: (row: StockRow) => (
                  <div className="flex flex-wrap gap-2">
                    <StockAccountModal
                      variant="edit"
                      trigger="icon"
                      stock={withPrivateNotesForCurrentUser(withoutImages(row), currentProfile.id, currentProfile.role === "admin")}
                      existingImageCount={row.image_urls?.length ?? (row.image_url ? 1 : 0)}
                      employees={employees}
                      gameCategories={settings.game_categories}
                      canViewBuyingPrice={canViewBuyingPrice}
                      currentProfileId={currentProfile.id}
                      isAdmin={currentProfile.role === "admin"}
                      canAssignAnyEmployee={currentProfile.role !== "employee"}
                    />
                    <form action={deleteStockAccount}>
                      <input type="hidden" name="id" value={row.id} />
                      <DeleteButton label="Delete account" iconOnly />
                    </form>
                  </div>
                )
              } as const]
            : [])
        ]}
      />
    </>
  );
}
