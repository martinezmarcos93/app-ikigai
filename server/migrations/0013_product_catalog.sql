-- Catálogo de productos que vende el gimnasio (proteína, creatina, barras, etc.) y reservas de los miembros.
-- No hay pagos en la app: el miembro reserva y paga/retira en el mostrador; administración marca la entrega.
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  price numeric(12,2) CHECK (price IS NULL OR price >= 0),
  available boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_active_idx ON products (lower(category), lower(name)) WHERE active;

CREATE TABLE product_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES member_profiles(id) ON DELETE RESTRICT,
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  note text CHECK (note IS NULL OR length(note) <= 200),
  -- Precio al momento de reservar (referencia para el mostrador; el producto puede cambiar de precio después).
  unit_price_snapshot numeric(12,2) CHECK (unit_price_snapshot IS NULL OR unit_price_snapshot >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  handled_at timestamptz,
  CHECK ((status = 'pending') = (handled_at IS NULL))
);
CREATE INDEX product_reservations_member_idx ON product_reservations (member_id, created_at DESC);
CREATE INDEX product_reservations_pending_idx ON product_reservations (created_at) WHERE status = 'pending';
