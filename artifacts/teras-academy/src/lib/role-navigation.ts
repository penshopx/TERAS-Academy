export type TerasRole = "admin" | "trainer" | "assessor" | "learner";

const rolePriority: Array<{ role: TerasRole; href: string }> = [
  { role: "admin", href: "/admin" },
  { role: "trainer", href: "/trainer" },
  { role: "assessor", href: "/assessor" },
  { role: "learner", href: "/dashboard" },
];

export function homeForRoles(roles: readonly string[]) {
  return rolePriority.find(({ role }) => roles.includes(role))?.href ?? null;
}