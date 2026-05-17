alter type expense_category add value if not exists 'scam_account';
alter type expense_category add value if not exists 'refund_account';

update public.settings
set expense_categories =
  case
    when expense_categories @> array['scam_account'] then expense_categories
    else expense_categories || array['scam_account']
  end;

update public.settings
set expense_categories =
  case
    when expense_categories @> array['refund_account'] then expense_categories
    else expense_categories || array['refund_account']
  end;
