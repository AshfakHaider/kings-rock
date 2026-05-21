import type React from "react";
import { saveAdvance, saveAdvanceTransaction, saveEmployee, saveExpense, saveGmail, saveSale, saveSettings, saveStockAccount } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EmployeeAdvance, GmailAccount, Profile, Settings, StockAccount } from "@/lib/types";

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} />
    </div>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-2 md:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

export function FormCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {title}
      </summary>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </details>
  );
}

export function StockForm({
  employees,
  gmailAccounts,
  stock
}: {
  employees: Profile[];
  gmailAccounts: GmailAccount[];
  stock?: StockAccount;
}) {
  return (
    <form action={saveStockAccount} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" defaultValue={stock?.id ?? ""} />
      <Field label="Game name" name="game_name" defaultValue={stock?.game_name} required />
      <Field label="Account title" name="account_title" defaultValue={stock?.account_title} required />
      <Field label="Purchase source" name="purchase_source" defaultValue={stock?.purchase_source} />
      <Field label="Buying price" name="buying_price" type="number" defaultValue={stock?.buying_price} required />
      <Field label="Purchase date" name="purchase_date" type="date" defaultValue={stock?.purchase_date} required />
      <div className="space-y-2">
        <Label>Status</Label>
        <Select name="status" defaultValue={stock?.status ?? "available"}>
          {["available", "assigned", "sold", "hold", "problem"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Assigned employee</Label>
        <Select name="assigned_employee_id" defaultValue={stock?.assigned_employee_id ?? ""}>
          <option value="">Unassigned</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.name}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Linked Gmail</Label>
        <Select name="gmail_id" defaultValue={stock?.gmail_id ?? ""}>
          <option value="">No Gmail</option>
          {gmailAccounts.map((gmail) => (
            <option key={gmail.id} value={gmail.id}>{gmail.email}</option>
          ))}
        </Select>
      </div>
      <TextAreaField label="Account details" name="account_details" defaultValue={stock?.account_details} />
      <TextAreaField label="Notes" name="notes" defaultValue={stock?.notes} />
      <Button className="md:col-span-2">Save stock account</Button>
    </form>
  );
}

export function SaleForm({
  stockAccounts,
  employees
}: {
  stockAccounts: StockAccount[];
  employees: Profile[];
}) {
  return (
    <form action={saveSale} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Stock account</Label>
        <Select name="stock_account_id" required>
          {stockAccounts.filter((account) => account.status !== "sold").map((account) => (
            <option key={account.id} value={account.id}>{account.account_title}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Employee</Label>
        <Select name="employee_id" required>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.name}</option>
          ))}
        </Select>
      </div>
      <Field label="Sold amount" name="sold_amount" type="number" required />
      <Field label="Source website" name="sold_source_website" />
      <Field label="Buyer contact" name="buyer_contact" />
      <Field label="Payment method" name="payment_method" />
      <Field label="Sold date" name="sold_date" type="date" required />
      <div className="space-y-2">
        <Label>Payment status</Label>
        <Select name="payment_status" defaultValue="pending">
          {["pending", "paid", "partial"].map((status) => (
            <option key={status} value={status}>{status === "pending" ? "waiting payment" : status}</option>
          ))}
        </Select>
      </div>
      <TextAreaField label="Notes" name="notes" />
      <Button className="md:col-span-2">Save sale</Button>
    </form>
  );
}

export function GmailForm() {
  return (
    <form action={saveGmail} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="status" value="fresh" />
      <input type="hidden" name="date_added" value={new Date().toISOString().slice(0, 10)} />
      <Field label="Gmail" name="email" type="email" required />
      <Field label="Recovery phone number" name="recovery_info" required />
      <Button className="md:col-span-2">Save Gmail</Button>
    </form>
  );
}

export function EmployeeForm() {
  return (
    <form action={saveEmployee} className="grid gap-4 md:grid-cols-2">
      <Field label="Name" name="name" required />
      <Field label="Email" name="email" type="email" required />
      <Field label="Auth user id" name="auth_user_id" />
      <Field label="Phone" name="phone" />
      <Field label="Join date" name="join_date" type="date" required />
      <div className="space-y-2">
        <Label>Role</Label>
        <Select name="role" defaultValue="employee">
          {["admin", "manager", "employee"].map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select name="status" defaultValue="active">
          {["active", "inactive"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>
      </div>
      <TextAreaField label="Notes" name="notes" />
      <Button className="md:col-span-2">Save employee</Button>
    </form>
  );
}

export function AdvanceForm({ employees }: { employees: Profile[] }) {
  return (
    <form action={saveAdvance} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Employee</Label>
        <Select name="employee_id" required>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.name}</option>
          ))}
        </Select>
      </div>
      <Field label="Amount given" name="amount_given" type="number" required />
      <Field label="Date given" name="date_given" type="date" required />
      <Field label="Purpose" name="purpose" />
      <Field label="Payment method" name="payment_method" />
      <div className="space-y-2">
        <Label>Status</Label>
        <Select name="status" defaultValue="open">
          {["open", "partial", "settled"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>
      </div>
      <TextAreaField label="Notes" name="notes" />
      <Button className="md:col-span-2">Save advance</Button>
    </form>
  );
}

export function AdvanceTransactionForm({
  advances,
  stockAccounts
}: {
  advances: EmployeeAdvance[];
  stockAccounts: StockAccount[];
}) {
  return (
    <form action={saveAdvanceTransaction} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Advance</Label>
        <Select name="advance_id" required>
          {advances.map((advance) => (
            <option key={advance.id} value={advance.id}>{advance.employee?.name ?? advance.employee_id} - {advance.purpose}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Employee</Label>
        <Select name="employee_id" required>
          {advances.map((advance) => (
            <option key={advance.id} value={advance.employee_id}>{advance.employee?.name ?? advance.employee_id}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select name="type" defaultValue="account_purchase">
          {["money_given", "account_purchase", "money_returned", "adjustment"].map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>
      </div>
      <Field label="Amount" name="amount" type="number" required />
      <div className="space-y-2">
        <Label>Stock account</Label>
        <Select name="stock_account_id">
          <option value="">No stock link</option>
          {stockAccounts.map((stock) => (
            <option key={stock.id} value={stock.id}>{stock.account_title}</option>
          ))}
        </Select>
      </div>
      <Field label="Transaction date" name="transaction_date" type="date" required />
      <TextAreaField label="Notes" name="notes" />
      <Button className="md:col-span-2">Save transaction</Button>
    </form>
  );
}

export function ExpenseForm({ employees }: { employees: Profile[] }) {
  return (
    <form action={saveExpense} className="grid gap-4 md:grid-cols-2">
      <Field label="Title" name="title" required />
      <Field label="Amount" name="amount" type="number" required />
      <Field label="Expense date" name="expense_date" type="date" required />
      <div className="space-y-2">
        <Label>Category</Label>
        <Select name="category" defaultValue="other">
          {["gmail_purchase", "ads", "website_fee", "employee_payment", "scam_account", "refund_account", "other"].map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Paid by</Label>
        <Select name="paid_by">
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.name}</option>
          ))}
        </Select>
      </div>
      <TextAreaField label="Notes" name="notes" />
      <Button className="md:col-span-2">Save expense</Button>
    </form>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  return (
    <form action={saveSettings} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" defaultValue={settings.id} />
      <Field label="Business name" name="business_name" defaultValue={settings.business_name} required />
      <Field label="Currency" name="currency" defaultValue={settings.currency} required />
      <Field label="Game categories" name="game_categories" defaultValue={settings.game_categories.join(", ")} />
      <Field label="Sale source websites" name="sale_source_websites" defaultValue={settings.sale_source_websites.join(", ")} />
      <Field label="Expense categories" name="expense_categories" defaultValue={settings.expense_categories.join(", ")} />
      <Button className="md:col-span-2">Save settings</Button>
    </form>
  );
}
