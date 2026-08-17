CREATE OR REPLACE FUNCTION public.enforce_shopeepay_expense_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w_type text;
  w_name text;
  is_shopeepay boolean;
BEGIN
  IF NEW.type <> 'expense' THEN
    RETURN NEW;
  END IF;

  IF NEW.category_id IS NOT NULL AND coalesce(btrim(NEW.category_name), '') <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.wallet_id IS NOT NULL THEN
    SELECT type, name INTO w_type, w_name FROM public.wallets WHERE id = NEW.wallet_id;
  END IF;

  is_shopeepay :=
    coalesce(w_type, '') = 'Driver'
    OR lower(replace(coalesce(w_name, ''), ' ', '')) = 'shopeepay'
    OR lower(replace(coalesce(NEW.wallet_name, ''), ' ', '')) = 'shopeepay';

  IF is_shopeepay THEN
    RAISE EXCEPTION 'Expense on ShopeePay requires a category'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_shopeepay_expense_category ON public.transactions;

CREATE TRIGGER enforce_shopeepay_expense_category
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_shopeepay_expense_category();