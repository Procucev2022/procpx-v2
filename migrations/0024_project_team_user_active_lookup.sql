CREATE INDEX IF NOT EXISTS project_teams_user_active_project_idx
  ON project_teams (userId, active, projectId);
