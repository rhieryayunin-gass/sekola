"use client";
import { CurriculumManager } from "../curriculum/curriculum-manager";
import { RecordWorkspace, SchoolHierarchy } from "../school/record-workspace";
import { academicSpecs } from "../school/resource-specs";
export function AcademicManager() { return <><SchoolHierarchy/><CurriculumManager/><RecordWorkspace specs={academicSpecs}/></>; }
