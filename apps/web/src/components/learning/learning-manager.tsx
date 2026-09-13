"use client";
import { CurriculumLearning } from "../curriculum/curriculum-learning";
import { RecordWorkspace, SchoolHierarchy } from "../school/record-workspace";
import { learningSpecs } from "../school/resource-specs";
import { QuestionWorkspace } from "../school/question-workspace";
export function LearningManager() { return <><SchoolHierarchy/><CurriculumLearning/><RecordWorkspace specs={learningSpecs}/><QuestionWorkspace/></>; }
