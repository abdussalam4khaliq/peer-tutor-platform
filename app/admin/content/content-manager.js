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
  const [busyId, setBusyId] = useState(null);

  function refresh() {
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
    setBusyId(school.id);
    await supabase.from("schools").update({ name }).eq("id", school.id);
    setBusyId(null);
    refresh();
  }

  async function deleteSchool(school) {
    const impact = schoolImpact(school);
    const ok = window.confirm(
      `Delete "${school.name}"? This will also delete ${impact.faculties} faculties, ${impact.departments} departments, and ${impact.courses} courses. This cannot be undone.`
    );
    if (!ok) return;
    setBusyId(school.id);
    await supabase.from("schools").delete().eq("id", school.id);
    setBusyId(null);
    refresh();
  }

  async function addFaculty(schoolId, name, setLocalBusy) {
    if (!name.trim()) return;
    setLocalBusy(true);
    await supabase.from("faculties").insert({ school_id: schoolId, name: name.trim() });
    setLocalBusy(false);
    refresh();
  }

  async function renameFaculty(faculty) {
    const name = window.prompt("New faculty name:", faculty.name);
    if (!name || name === faculty.name) return;
    setBusyId(faculty.id);
    await supabase.from("faculties").update({ name }).eq("id", faculty.id);
    setBusyId(null);
    refresh();
  }

  async function deleteFaculty(faculty) {
    const impact = facultyImpact(faculty);
    const ok = window.confirm(
      `Delete "${faculty.name}"? This will also delete ${impact.departments} departments and ${impact.courses} courses. This cannot be undone.`
    );
    if (!ok) return;
    setBusyId(faculty.id);
    await supabase.from("faculties").delete().eq("id", faculty.id);
    setBusyId(null);
    refresh();
  }

  async function addDepartment(facultyId, name, setLocalBusy) {
    if (!name.trim()) return;
    setLocalBusy(true);
    await supabase.from("departments").insert({ faculty_id: facultyId, name: name.trim() });
    setLocalBusy(false);
    refresh();
  }

  async function renameDepartment(department) {
    const name = window.prompt("New department name:", department.name);
    if (!name || name === department.name) return;
    setBusyId(department.id);
    await supabase.from("departments").update({ name }).eq("id", department.id);
    setBusyId(null);
    refresh();
  }

  async function deleteDepartment(department) {
    const impact = departmentImpact(department);
    const ok = window.confirm(
      `Delete "${department.name}"? This will also delete ${impact.courses} courses. This cannot be undone.`
    );
    if (!ok) return;
    setBusyId(department.id);
    await supabase.from("departments").delete().eq("id", department.id);
    setBusyId(null);
    refresh();
  }

  async function addCourse(departmentId, code, title, setLocalBusy) {
    if (!code.trim() || !title.trim()) return;
    setLocalBusy(true);
    await supabase.from("courses").insert({ department_id: departmentId, code: code.trim(), title: title.trim() });
    setLocalBusy(false);
    refresh();
  }

  async function renameCourse(course) {
    const code = window.prompt("Course code:", course.code);
    if (code === null) return;
    const title = window.prompt("Course title:", course.title);
    if (title === null) return;
    setBusyId(course.id);
    await supabase.from("courses").update({ code, title }).eq("id", course.id);
    setBusyId(null);
    refresh();
  }

  async function deleteCourse(course) {
    const ok = window.confirm(`Delete "${course.code} — ${course.title}"? This cannot be undone.`);
    if (!ok) return;
    setBusyId(course.id);
    await supabase.from("courses").delete().eq("id", course.id);
    setBusyId(null);
    refresh();
  }

  return (
    <div>
      <form onSubmit={addSchool} className="action-row" style={{ marginBottom: "1.5rem" }}>
        <input
          placeholder="New school name"
          value={newSchoolName}
          onChange={(e) => setNewSchoolName(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Adding..." : "+ Add school"}</button>
      </form>

      {schools.map((school) => (
        <details key={school.id} className="card">
          <summary style={{ cursor: "pointer" }}>
            <strong>{school.name}</strong>
            <span className="action-row" style={{ display: "inline-flex", marginLeft: 10 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => renameSchool(school)} disabled={busyId === school.id}>Rename</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteSchool(school)} disabled={busyId === school.id}>
                {busyId === school.id ? "Deleting..." : "Delete"}
              </button>
            </span>
          </summary>

          <div style={{ marginLeft: "1rem", marginTop: "0.75rem" }}>
            <AddInline placeholder="New faculty name" onAdd={(name, setLocalBusy) => addFaculty(school.id, name, setLocalBusy)} label="+ Add faculty" />

            {(school.faculties || []).map((faculty) => (
              <details key={faculty.id} className="card" style={{ margin: "0.5rem 0" }}>
                <summary style={{ cursor: "pointer" }}>
                  {faculty.name}
                  <span className="action-row" style={{ display: "inline-flex", marginLeft: 10 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => renameFaculty(faculty)} disabled={busyId === faculty.id}>Rename</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteFaculty(faculty)} disabled={busyId === faculty.id}>
                      {busyId === faculty.id ? "Deleting..." : "Delete"}
                    </button>
                  </span>
                </summary>

                <div style={{ marginLeft: "1rem", marginTop: "0.5rem" }}>
                  <AddInline placeholder="New department name" onAdd={(name, setLocalBusy) => addDepartment(faculty.id, name, setLocalBusy)} label="+ Add department" />

                  {(faculty.departments || []).map((department) => (
                    <details key={department.id} className="card" style={{ margin: "0.5rem 0" }}>
                      <summary style={{ cursor: "pointer" }}>
                        {department.name}
                        <span className="action-row" style={{ display: "inline-flex", marginLeft: 10 }}>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => renameDepartment(department)} disabled={busyId === department.id}>Rename</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteDepartment(department)} disabled={busyId === department.id}>
                            {busyId === department.id ? "Deleting..." : "Delete"}
                          </button>
                        </span>
                      </summary>

                      <div style={{ marginLeft: "1rem", marginTop: "0.5rem" }}>
                        <AddCourseInline onAdd={(code, title, setLocalBusy) => addCourse(department.id, code, title, setLocalBusy)} />

                        <ul style={{ paddingLeft: 18 }}>
                          {(department.courses || []).map((course) => (
                            <li key={course.id} style={{ marginBottom: 6 }}>
                              {course.code} — {course.title} <em>({course.status})</em>
                              <span className="action-row" style={{ display: "inline-flex", marginLeft: 8 }}>
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => renameCourse(course)} disabled={busyId === course.id}>Edit</button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteCourse(course)} disabled={busyId === course.id}>
                                  {busyId === course.id ? "Deleting..." : "Delete"}
                                </button>
                              </span>
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
  const [busy, setBusy] = useState(false);

  return (
    <div className="action-row" style={{ marginBottom: 8 }}>
      <input placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1 }} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() => {
          onAdd(value, setBusy);
          setValue("");
        }}
      >
        {busy ? "Adding..." : label}
      </button>
    </div>
  );
}

function AddCourseInline({ onAdd }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="action-row" style={{ marginBottom: 8 }}>
      <input placeholder="Code (e.g. CSC201)" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 140 }} />
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() => {
          onAdd(code, title, setBusy);
          setCode("");
          setTitle("");
        }}
      >
        {busy ? "Adding..." : "+ Add course"}
      </button>
    </div>
  );
}