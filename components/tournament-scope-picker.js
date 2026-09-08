"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TournamentScopePicker({ onChange }) {
  const supabase = createClient();

  const [scopeType, setScopeType] = useState("universal");
  const [schools, setSchools] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    supabase.from("schools").select("id, name").order("name").then(({ data }) => setSchools(data || []));
  }, []);

  useEffect(() => {
    setFacultyId("");
    setDepartmentId("");
    setFaculties([]);
    setDepartments([]);
    if (!schoolId) return;
    supabase.from("faculties").select("id, name").eq("school_id", schoolId).order("name").then(({ data }) => setFaculties(data || []));
  }, [schoolId]);

  useEffect(() => {
    setDepartmentId("");
    setDepartments([]);
    if (!facultyId) return;
    supabase.from("departments").select("id, name").eq("faculty_id", facultyId).order("name").then(({ data }) => setDepartments(data || []));
  }, [facultyId]);

  useEffect(() => {
    if (scopeType === "universal") {
      onChange({ scope: "universal", scopeId: null });
    } else if (scopeType === "school" && schoolId) {
      onChange({ scope: "school", scopeId: schoolId });
    } else if (scopeType === "faculty" && facultyId) {
      onChange({ scope: "faculty", scopeId: facultyId });
    } else if (scopeType === "department" && departmentId) {
      onChange({ scope: "department", scopeId: departmentId });
    } else {
      onChange({ scope: scopeType, scopeId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, schoolId, facultyId, departmentId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>
        Scope
        <select value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
          <option value="universal">Universal (everyone)</option>
          <option value="school">A specific school</option>
          <option value="faculty">A specific faculty</option>
          <option value="department">A specific department</option>
        </select>
      </label>

      {scopeType !== "universal" && (
        <label>
          School
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Select a school</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      {(scopeType === "faculty" || scopeType === "department") && schoolId && (
        <label>
          Faculty
          <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
            <option value="">Select a faculty</option>
            {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      )}

      {scopeType === "department" && facultyId && (
        <label>
          Department
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Select a department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}