CREATE UNIQUE INDEX IF NOT EXISTS "teras_person_roles_single_super_admin"
  ON "teras_person_roles" ("role")
  WHERE "role" = 'super_admin';