CREATE INDEX IF NOT EXISTS ppo_lines_project_status_boq_line_aggregate_idx
  ON ppo_lines (tenantId, projectId, status, boqLineId, orderedAmount, orderedQuantity);
