import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, KeyRound, LockKeyhole, Mail, UserRound } from "lucide-react";
import { PageHeader } from "@/components/modules/page-header";
import { StatusBadge } from "@/components/modules/status-badge";
import { CopyStockTitleButton } from "@/components/stock/copy-stock-title-button";
import { StockImageGallery } from "@/components/stock/stock-image-gallery";
import { StockAccountModal } from "@/components/stock/stock-account-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfile, getProfiles, getSettings, getStockAccountCredential, getStockAccounts } from "@/lib/data";
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
  const [settings, accounts, profiles, currentProfile] = await Promise.all([
    getSettings(),
    getStockAccounts(),
    getProfiles(),
    getCurrentProfile()
  ]);
  const account = accounts.find((item) => item.id === id);

  if (!account) notFound();
  const canViewBuyingPrice = currentProfile.role !== "employee";
  const canManageStockRecords = currentProfile.role !== "employee";
  const credential = await getStockAccountCredential(account, currentProfile);

  const images =
    account.image_urls && account.image_urls.length > 0
      ? account.image_urls
      : account.image_url
        ? [account.image_url]
        : [];

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
                stock={account}
                existingImageCount={images.length}
                employees={profiles.filter((profile) => profile.role !== "admin")}
                gameCategories={settings.game_categories}
                canViewBuyingPrice={canViewBuyingPrice}
              />
            ) : null}
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <StockImageGallery images={images} title={accountTitle(account.secret_code, account.account_title)} />
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
                Assigned employee
              </span>
              <span>{account.assigned_employee?.name ?? "Unassigned"}</span>
            </div>
            {credential ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Gmail
                  </span>
                  <code className="min-w-0 max-w-[60%] truncate rounded-md bg-muted px-2 py-1 text-sm">
                    {credential.gmail_email}
                  </code>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LockKeyhole className="h-4 w-4" />
                    Password
                  </span>
                  <code className="min-w-0 max-w-[60%] truncate rounded-md bg-muted px-2 py-1 text-sm">
                    {credential.password ?? "-"}
                  </code>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {account.notes || "No notes added."}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
