-- Notificaciones push de los avisos: cada dispositivo que la persona habilita guarda su suscripcion Web Push.
-- No contiene datos personales legibles: es una direccion opaca del servicio de push (Google, Apple, Mozilla) y dos claves
-- publicas para cifrar el mensaje. Si el servicio responde que ya no existe (404/410), se borra.
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 1 AND 1000),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 80 AND 100),
  auth text NOT NULL CHECK (length(auth) BETWEEN 16 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
