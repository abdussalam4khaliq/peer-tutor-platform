export const MAX_TUTOR_COURSES = 3;
export const MAX_ADMIN_TUTOR_COURSES = 1;

// Temporary bootstrapping exception — flip to false once admins are on a paid allowance
// and you no longer want them able to also tutor for course-completion pay.
export const ALLOW_ADMIN_TUTORING = true;

export function getMaxCoursesForRole(role) {
  if (role === "admin" || role === "super_admin") return MAX_ADMIN_TUTOR_COURSES;
  return MAX_TUTOR_COURSES;
}

export function canApplyToTutor(role) {
  if (role === "tutor") return true;
  if ((role === "admin" || role === "super_admin") && ALLOW_ADMIN_TUTORING) return true;
  return false;
}