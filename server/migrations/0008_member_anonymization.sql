-- Supresion de datos personales de un miembro que dejo el gimnasio (derecho de supresion), conservando la integridad
-- financiera y de asistencia: el perfil queda como «persona anonimizada» y su historial agregado sigue siendo valido.
ALTER TABLE member_profiles
  ADD COLUMN anonymized_at timestamptz,
  ADD CONSTRAINT member_anonymized_only_when_exited CHECK (anonymized_at IS NULL OR status = 'exited');
