"use client";
import { RecordWorkspace, SchoolHierarchy } from "../school/record-workspace";
import { academicSpecs } from "../school/resource-specs";
export function AcademicManager() { return <><SchoolHierarchy/><RecordWorkspace specs={academicSpecs}/></>; }
