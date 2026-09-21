-- A promo code may now take the whole price (PERCENT 100, or FIXED equal to the price). Such a
-- checkout never reaches a payment provider: it is recorded as a paid Rp0 transaction with
-- provider 'free', and that is the only transaction allowed to be Rp0.
ALTER TABLE "promo_codes" DROP CONSTRAINT "promo_codes_discount_range";
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_discount_range" CHECK (
  ("discount_type" = 'PERCENT' AND "discount_value" BETWEEN 1 AND 100) OR
  ("discount_type" = 'FIXED' AND "discount_value" > 0)
);

ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_amount_positive";
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_amount_positive" CHECK (
  "amount" > 0 OR ("amount" = 0 AND "provider" = 'free' AND "status" IN ('PAID', 'REFUNDED'))
);
