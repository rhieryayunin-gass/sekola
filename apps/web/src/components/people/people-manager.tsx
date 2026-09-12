"use client";
import { RecordWorkspace, SchoolHierarchy } from "../school/record-workspace";
import { peopleSpecs } from "../school/resource-specs";
export function PeopleManager() { return <><SchoolHierarchy/><RecordWorkspace specs={peopleSpecs}/></>; }
