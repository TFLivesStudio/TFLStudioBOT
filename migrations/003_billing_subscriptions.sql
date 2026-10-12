CREATE TABLE billing_subscriptions (
 id bigserial PRIMARY KEY, label text NOT NULL, provider text NOT NULL,
 amount_minor bigint NOT NULL, currency char(3) NOT NULL,
 cadence_months integer NOT NULL CHECK (cadence_months BETWEEN 1 AND 120),
 next_due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'active'
 CHECK(status IN ('active','paused','cancelled')),
 notes text NOT NULL DEFAULT '', created_by text NOT NULL,
 updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_subscriptions_due ON billing_subscriptions(next_due_at) WHERE status='active';
