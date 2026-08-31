"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function schoolImpact(school) {
  const faculties = school.faculties || [];
  let departments = 0, courses = 0;
  faculties.forEach((f) => {
    const depts = f.departments || [];
    departments += depts.length;
    depts.forEach((d) => (courses += (d.courses || []).length));
  });
  return { faculties: faculties.length, departments, courses };
}

function facultyImpact(faculty) {
  const depts = faculty.departments || [];
  const courses = depts.reduce((sum, d) => sum + (d.courses || []).length, 0);
  return { departments: depts.length, courses };
}

function departmentImpact(department) {
  return { courses: (department.courses || []).length };
}

export default function ContentManager({ schools }) {
  const router = useRouter();
  const supabase = createClient();
  const [newSchoolName, setNewSchoolName] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    router.refresh();
  }

  async function addSchool(e) {
    e.preventDefault();
    if (!newSchoolName.trim()) return;
    setBusy(true);
    await supabase.from("schools").insert({ name: newSchoolName.trim() });
    setNewSchoolName("");
    setBusy(false);
    refresh();
  }

  async function renameSchool(school) {
    const name = window.prompt("New school name:", school.name);
    if (!name || name === school.name) return;
    await supabase.from("schools").update({ name }).eq("id", school.id);
    refresh();
  }

  async function deleteSchool(school) {
    const impact = schoolImpact(school);
    const ok = window.confirm(
      `Delete "${school.name}"? This will also delete ${impact.faculties} faculties, ${impact.departments} departments, and ${impact.courses} courses. This cannot be undone.`
    );
    if (!ok) return;
    await supabase.from("schools").delete().eq("id", school.id);
    refresh();
  }

  async function addFaculty(schoolId, name) {
    if (!name.trim()) return;
    await supabase.from("faculties").insert({ school_id: schoolId, name: name.trim() });
    refresh();
  }

  async function renameFaculty(faculty) {
    const name = window.prompt("New faculty name:", faculty.name);
    if (!name || name === faculty.name) return;
    await supabase.from("faculties").update({ name }).eq("id", faculty.id);
    refresh();
  }

  async function deleteFaculty(faculty) {
    const impact = facultyImpact(faculty);
    const ok = window.confirm(
      `Delete "${faculty.name}"? This will also delete ${impact.departments} departments and ${impact.courses} courses. This cannot be undone.`
    );
    if (!ok) return;
    await supabase.from("faculties").delete().eq("id", faculty.id);
    refresh();
  }

  async function addDepartment(facultyId, name) {
    if (!name.trim()) return;
    await supabase.from("departments").insert({ faculty_id: facultyId, name: name.trim() });
    refresh();
  }

  async function renameDepartment(department) {
    const name = window.prompt("New department name:", department.name);
    if (!name || name === department.name) return;
    await supabase.from("departments").update({ name }).eq("id", department.id);
    refresh();
  }

  async function deleteDepartment(department) {
    const impact = departmentImpact(department);
    const ok = window.confirm(
      `Delete "${department.name}"? This will also delete ${impact.courses} courses. This cannot be undone.`
    );
    if (!ok) return;
    await supabase.from("departments").delete().eq("id", department.id);
    refresh();
  }

  async function addCourse(departmentId, code, title) {
    if (!code.trim() || !title.trim()) return;
    await supabase.from("courses").insert({ department_id: departmentId, code: code.trim(), title: title.trim() });
    refresh();
  }

  async function renameCourse(course) {
    const code = window.prompt("Course code:", course.code);
    if (code === null) return;
    const title = window.prompt("Course title:", course.title);
    if (title === null) return;
    await supabase.from("courses").update({ code, title }).eq("id", course.id);
    refresh();
  }

  async function deleteCourse(course) {
    const ok = window.confirm(`Delete "${course.code} — ${course.title}"? This cannot be undone.`);
    if (!ok) return;
    await supabase.from("courses").delete().eq("id", course.id);
    refresh();
  }

  return (
    <div>
      <form onSubmit={addSchool} style={{ display: "flex", gap: 8, marginBottom: "1.5rem" }}>
        <input
          placeholder="New school name"
          value={newSchoolName}
          onChange={(e) => setNewSchoolName(e.target.value)}
        />
        <button type="submit" disabled={busy}>+ Add school</button>
      </form>

      {schools.map((school) => (
        <details key={school.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem", marginBottom: "0.75rem" }}>
          <summary style={{ cursor: "pointer" }}>
            <strong>{school.name}</strong>{" "}
            <button type="button" onClick={() => renameSchool(school)}>Rename</button>{" "}
            <button type="button" onClick={() => deleteSchool(school)}>Delete</button>
          </summary>

          <div style={{ marginLeft: "1rem", marginTop: "0.75rem" }}>
            <AddInline placeholder="New faculty name" onAdd={(name) => addFaculty(school.id, name)} label="+ Add faculty" />

            {(school.faculties || []).map((faculty) => (
              <details key={faculty.id} style={{ border: "1px solid #eee", borderRadius: 6, padding: "0.5rem", margin: "0.5rem 0" }}>
                <summary style={{ cursor: "pointer" }}>
                  {faculty.name}{" "}
                  <button type="button" onClick={() => renameFaculty(faculty)}>Rename</button>{" "}
                  <button type="button" onClick={() => deleteFaculty(faculty)}>Delete</button>
                </summary>

                <div style={{ marginLeft: "1rem", marginTop: "0.5rem" }}>
                  <AddInline placeholder="New department name" onAdd={(name) => addDepartment(faculty.id, name)} label="+ Add department" />

                  {(faculty.departments || []).map((department) => (
                    <details key={department.id} style={{ border: "1px solid #f0f0f0", borderRadius: 6, padding: "0.5rem", margin: "0.5rem 0" }}>
                      <summary style={{ cursor: "pointer" }}>
                        {department.name}{" "}
                        <button type="button" onClick={() => renameDepartment(department)}>Rename</button>{" "}
                        <button type="button" onClick={() => deleteDepartment(department)}>Delete</button>
                      </summary>

                      <div style={{ marginLeft: "1rem", marginTop: "0.5rem" }}>
                        <AddCourseInline onAdd={(code, title) => addCourse(department.id, code, title)} />

                        <ul>
                          {(department.courses || []).map((course) => (
                            <li key={course.id} style={{ marginBottom: 4 }}>
                              {course.code} — {course.title}{" "}
                              <em>({course.status})</em>{" "}
                              <button type="button" onClick={() => renameCourse(course)}>Edit</button>{" "}
                              <button type="button" onClick={() => deleteCourse(course)}>Delete</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function AddInline({ placeholder, onAdd, label }) {
  const [value, setValue] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      <input placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
      <button
        type="button"
        onClick={() => {
          onAdd(value);
          setValue("");
        }}
      >
        {label}
      </button>
    </div>
  );
}

function AddCourseInline({ onAdd }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      <input placeholder="Code (e.g. CSC201)" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 120 }} />
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button
        type="button"
        onClick={() => {
          onAdd(code, title);
          setCode("");
          setTitle("");
        }}
      >
        + Add course
      </button>
    </div>
  );
}