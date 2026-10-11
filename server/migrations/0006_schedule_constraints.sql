-- Agenda: evita plantillas y turnos fijos duplicados. Las tablas existian desde 0001;
-- esta migracion solo agrega restricciones para que la API de agenda sea segura ante
-- solicitudes concurrentes.
CREATE UNIQUE INDEX class_templates_active_slot_unique
  ON class_templates(coach_id, weekday, local_start_time)
  WHERE active;

CREATE UNIQUE INDEX recurring_assignments_one_active_unique
  ON recurring_assignments(member_id, template_id)
  WHERE active;

CREATE INDEX class_templates_service_idx ON class_templates(service_id);
CREATE INDEX recurring_assignments_template_idx ON recurring_assignments(template_id) WHERE active;
