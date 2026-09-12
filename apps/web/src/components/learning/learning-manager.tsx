"use client";
import { RecordWorkspace, SchoolHierarchy } from "../school/record-workspace";
import { learningSpecs } from "../school/resource-specs";
import { QuestionWorkspace } from "../school/question-workspace";
export function LearningManager() { return <><SchoolHierarchy/><RecordWorkspace specs={learningSpecs}/><QuestionWorkspace/></>; }
