"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SchoolPicker({ onChange }) {
  const supabase = createClient();

  const [mode, setMode] = useState("select");

  const [schools, setSchools] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const [reqSchool, setReqSchool] = useState("");
  const [reqFaculty, setReqFaculty] = useState("");
  const [reqDepartment, setReqDepartment] = useState("");

  useEffect(() => {
    supabase.from("schools").select("id, name").order("name").then(({ data }) => setSchools(data || []));
  }, []);

  useEffect(() => {
    setFacultyId("");
    setDepartments([]);
    setDepartmentId("");
    if (!schoolId) {
      setFaculties([]);
      return;
    }
    supabase.from("faculties").select("id, name").eq("school_id", schoolId).order("name").then(({ data }) => setFaculties(data || []));
  }, [schoolId]);

  useEffect(() => {
    setDepartmentId("");
    if (!facultyId) {
      setDepartments([]);
      return;
    }
    supabase.from("departments").select("id, name").eq("faculty_id", facultyId).order("name").then(({ data }) => setDepartments(data || []));
  }, [facultyId]);

  useEffect(() => {
    if (mode === "select") {
      if (!departmentId) return;
      const school = schools.find((s) => s.id === schoolId);
      const department = departments.find((d) => d.id === departmentId);
      onChange({ departmentId, schoolName: school?.name || "", departmentName: department?.name || "" });
    } else {
      if (!reqSchool.trim() || !reqFaculty.trim() || !reqDepartment.trim()) return;
      onChange({ mode: "request", schoolName: reqSchool.trim(), facultyName: reqFaculty.trim(), departmentName: reqDepartment.trim() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, departmentId, reqSchool, reqFaculty, reqDepartment]);

  if (mode === "request") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input placeholder="Your school's name" value={reqSchool} onChange={(e) => setReqSchool(e.target.value)} required />
        <input placeholder="Your faculty's name" value={reqFaculty} onChange={(e) => setReqFaculty(e.target.value)} required />
        <input placeholder="Your department's name" value={reqDepartment} onChange={(e) => setReqDepartment(e.target.value)} required />
        <p style={{ fontSize: 13, color: "var(--ink-600)", margin: 0 }}>
          Your account will be pending until an admin sets this up — usually within a day or two.
        </p>
        <button type="button" onClick={() => setMode("select")} style={{ fontSize: 13, alignSelf: "flex-start", background: "none", border: "none", color: "var(--moss)", cursor: "pointer", padding: 0 }}>
          ← Back to picking from the list
        </button>
      </div>
    );
  }

  return (
    <>
      <label>
        School:{" "}
        <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
          <option value="">Select your school</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      <label>
        Faculty:{" "}
        <select value={facultyId} onChange={(e) => setFacultyId(e.target.value)} required disabled={!schoolId}>
          <option value="">Select your faculty</option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </label>

      <label>
        Department:{" "}
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required disabled={!facultyId}>
          <option value="">Select your department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>

      <button type="button" onClick={() => setMode("request")} style={{ fontSize: 13, alignSelf: "flex-start", background: "none", border: "none", color: "var(--moss)", cursor: "pointer", padding: 0, textAlign: "left" }}>
        Can&apos;t find your school, faculty, or department? Request it →
      </button>
    </>
  );
}