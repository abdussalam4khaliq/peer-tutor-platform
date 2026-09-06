export const MAX_TUTOR_COURSES = 3;
export const MAX_ADMIN_TUTOR_COURSES = 1;

export function getMaxCoursesForRole(role) {
  if (role === "admin" || role === "super_admin") return MAX_ADMIN_TUTOR_COURSES;
  return MAX_TUTOR_COURSES;
}

// allowAdminTutoring is now a live database setting (site_settings.allow_admin_tutoring),
// not a hardcoded constant — fetch it and pass it in rather than importing a fixed value.
export function canApplyToTutor(role, allowAdminTutoring) {
  if (role === "tutor") return true;
  if ((role === "admin" || role === "super_admin") && allowAdminTutoring) return true;
  return false;
}