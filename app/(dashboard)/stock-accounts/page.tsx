import { deleteStockAccount } from "@/app/actions";
import type React from "react";
import { DeleteButton } from "@/components/modules/delete-button";
import { PageHeader } from "@/components/modules/page-header";
import { ResponsiveTable } from "@/components/modules/responsive-table";
import { StatusBadge } from "@/components/modules/status-badge";
import { AssignmentSelect } from "@/components/stock/assignment-select";
import { CopyStockTitleButton } from "@/components/stock/copy-stock-title-button";
import { StockAccountModal } from "@/components/stock/stock-account-modal";
import { DEFAULT_PAGE_SIZE, getCurrentProfile, getProfiles, getSettings, getStockAccountsPage, getStockTotals } from "@/lib/data";
import { stockDisplayTitle } from "@/lib/stock-title";
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

function withPrivateNotesForCurrentUser<T extends { assigned_employee_id?: string | null; notes?: string | null }>(
  account: T,
  currentProfileId: string,
  isAdmin: boolean
) {
  if (isAdmin || account.assigned_employee_id === currentProfileId) return account;
  return { ...account, notes: null };
}

export default async function StockAccountsPage({ searchParams }: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const params = (await searchParams) ?? {};
  const page = Number(params.page ?? 1);
  const [settings, stockPage, stockTotals, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getStockAccountsPage({ page, pageSize: DEFAULT_PAGE_SIZE, q: params.q, excludeSold: true }),
    getStockTotals({ excludeSold: true }),
    getProfiles(),
    getCurrentProfile()
  ]);
  const visibleStockAccounts = stockPage.rows;
  const employees = profiles.filter((profile) => profile.role !== "admin" && profile.status === "active");
  const canViewBuyingPrice = currentProfile.role !== "employee";
  const canManageStockRecords = currentProfile.role !== "employee";
  const totalAvailable = stockTotals.availableCount;
  const stockValue = stockTotals.buyingValue;
  const stockSellingValue = stockTotals.sellingValue;
  type StockRow = (typeof visibleStockAccounts)[number];

  return (
    <>
      <PageHeader
        title="Stock Accounts"
        description={
          canViewBuyingPrice
            ? `${totalAvailable} available accounts. Buying value ${money(stockValue, settings.currency)}. Selling value ${money(stockSellingValue, settings.currency)}.`
            : `${totalAvailable} available accounts. Selling value ${money(stockSellingValue, settings.currency)}.`
        }
        action={
          <StockAccountModal
            employees={profiles.filter((profile) => profile.role !== "admin")}
            gameCategories={settings.game_categories}
            canViewBuyingPrice={canViewBuyingPrice}
            currentProfileId={currentProfile.id}
            isAdmin={currentProfile.role === "admin"}
          />
        }
      />
      <ResponsiveTable
        rows={visibleStockAccounts}
        searchQuery={params.q}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        totalRows={stockPage.total}
        serverSide
        searchPlaceholder="Search by game, title, secret code, employee..."
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
            searchValue: (row) => `${row.account_title} ${row.game_name} ${row.secret_code ?? ""} ${row.assigned_employee?.name ?? ""}`
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
              />
            ),
            searchValue: (row) => row.assigned_employee?.name ?? "Available"
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
