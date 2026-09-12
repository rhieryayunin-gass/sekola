import { describe,it,expect } from "vitest";
import { generationInput,validateQuestion,type QuestionContent } from "./question-schema";
const question:QuestionContent={question_type:"MULTIPLE_CHOICE",prompt:"What is 2 + 2?",options:["3","4","5","6"],answer:"4",explanation:"Two pairs make four.",difficulty:"EASY",diagram:null};
describe("Question generation boundaries",()=>{
 it("rejects answer keys that cannot be selected",()=>{expect(()=>validateQuestion({...question,answer:"7"})).toThrow();});
 it("rejects duplicated choices",()=>{expect(()=>validateQuestion({...question,options:["4","4","5","6"]})).toThrow();});
 it("rejects diagrams whose labels and values do not match",()=>{expect(()=>validateQuestion({...question,diagram:{type:"bar",title:"Trees",labels:["A","B"],values:[10],unit:"trees"}})).toThrow();});
 it("does not accept batch replacement of a single question",()=>{expect(generationInput.safeParse({request_id:"00000000-0000-4000-8000-000000000001",set_id:"00000000-0000-4000-8000-000000000002",replace_id:"00000000-0000-4000-8000-000000000003",count:2,question_type:"ESSAY",difficulty:"EASY",include_image:false,instructions:""}).success).toBe(false);});
});
