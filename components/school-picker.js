"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SchoolPicker({ onChange }) {
  const supabase = createClient();

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
    setDepartments([]);
    setDepartmentId("");
    if (!schoolId) {
      setFaculties([]);
      return;
    }
    supabase
      .from("faculties")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("name")
      .then(({ data }) => setFaculties(data || []));
  }, [schoolId]);

  useEffect(() => {
    setDepartmentId("");
    if (!facultyId) {
      setDepartments([]);
      return;
    }
    supabase
      .from("departments")
      .select("id, name")
      .eq("faculty_id", facultyId)
      .order("name")
      .then(({ data }) => setDepartments(data || []));
  }, [facultyId]);

  useEffect(() => {
    if (!departmentId) return;
    const school = schools.find((s) => s.id === schoolId);
    const department = departments.find((d) => d.id === departmentId);
    onChange({ departmentId, schoolName: school?.name || "", departmentName: department?.name || "" });
  }, [departmentId]);

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
    </>
  );
}