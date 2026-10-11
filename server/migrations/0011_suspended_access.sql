-- Acceso deshabilitado por administracion: la persona deja de poder entrar (sin anonimizarla ni tocar su historial)
-- y se puede volver a habilitar. Estado propio y no 'disabled', que ya significa «cuenta sin activar» (invitacion
-- pendiente) o «anonimizada»: una invitacion vieja no debe poder reactivar un acceso suspendido.
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'disabled', 'pending', 'suspended'));
