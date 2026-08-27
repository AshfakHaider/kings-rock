import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, KeyRound, UserRound } from "lucide-react";
import { PageHeader } from "@/components/modules/page-header";
import { StatusBadge } from "@/components/modules/status-badge";
import { AssignmentSelect } from "@/components/stock/assignment-select";
import { CopyStockTitleButton } from "@/components/stock/copy-stock-title-button";
import { StockImageGallery } from "@/components/stock/stock-image-gallery";
import { StockAccountModal } from "@/components/stock/stock-account-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assignedEmployeeNames, canViewStockPrivateData, getCurrentProfile, getProfiles, getSettings, getStockAccount } from "@/lib/data";
import { createSignedStockImageUrls, stockImagePathsFromAccount } from "@/lib/stock-images";
import { stockDisplayTitle } from "@/lib/stock-title";
import { formatDate, money } from "@/lib/utils";

function accountTitle(code: string | null | undefined, title: string) {
  return stockDisplayTitle(code, title);
}

export default async function StockAccountDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [settings, account, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getStockAccount(id),
    getProfiles(),
    getCurrentProfile()
  ]);

  if (!account) notFound();
  const canViewBuyingPrice = currentProfile.role !== "employee";
  const canManageStockRecords = currentProfile.role !== "employee";
  const canViewPrivateNotes = canViewStockPrivateData(currentProfile);
  const modalStock = canViewPrivateNotes ? account : { ...account, notes: null };
  const employees = profiles.filter((profile) => profile.role !== "admin" && profile.status === "active");

  const images = await createSignedStockImageUrls(account, currentProfile);
  const existingImageCount = stockImagePathsFromAccount(account).length;

  return (
    <>
      <PageHeader
        title={accountTitle(account.secret_code, account.account_title)}
        description={`${account.game_name} account details and private sale data.`}
        action={
          <div className="flex flex-wrap gap-2">
            <CopyStockTitleButton title={accountTitle(account.secret_code, account.account_title)} showLabel />
            <Button asChild variant="outline">
              <Link href="/stock-accounts">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            {canManageStockRecords ? (
              <StockAccountModal
                variant="edit"
                stock={modalStock}
                existingImageCount={existingImageCount}
                employees={employees}
                gameCategories={settings.game_categories}
                canViewBuyingPrice={canViewBuyingPrice}
                currentProfileId={currentProfile.id}
                isAdmin={currentProfile.role === "admin"}
                canViewPrivateData={canViewPrivateNotes}
                canAssignAnyEmployee={currentProfile.role !== "employee"}
              />
            ) : null}
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <StockImageGallery
            images={images}
            title={accountTitle(account.secret_code, account.account_title)}
            refreshUrl={`/api/stock-accounts/${account.id}/images`}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge value={account.status} />
            </div>
            {canViewBuyingPrice ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Buying price</span>
                <strong>{money(account.buying_price, settings.currency)}</strong>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Selling price</span>
              <strong>{money(account.selling_price, settings.currency)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <KeyRound className="h-4 w-4" />
                Secret code
              </span>
              <code className="rounded-md bg-muted px-2 py-1 text-sm">{account.secret_code ?? "-"}</code>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Purchase date
              </span>
              <span>{formatDate(account.purchase_date)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserRound className="h-4 w-4" />
                Assigned employees
              </span>
              <span className="text-right">{assignedEmployeeNames(account).join(", ") || "Unassigned"}</span>
            </div>
            {account.status !== "sold" ? (
              <div className="rounded-lg border bg-muted/20 p-3">
                <AssignmentSelect account={account} employees={employees} currentProfile={currentProfile} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {canViewPrivateNotes ? (
        <Card>
          <CardHeader>
            <CardTitle>Private Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {account.notes || "No notes added."}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
