import { z } from "zod";
export const diagramSchema = z.object({ type: z.literal("bar"), title: z.string().max(120), labels: z.array(z.string().max(40)).min(2).max(8), values: z.array(z.number().min(0).max(100000)).min(2).max(8), unit: z.string().max(40) }).nullable();
export const questionSchema = z.object({ question_type: z.enum(["MULTIPLE_CHOICE", "ESSAY"]), prompt: z.string().min(5).max(10000), options: z.array(z.string().max(2000)).max(6), answer: z.string().min(1).max(10000), explanation: z.string().max(10000), difficulty: z.enum(["EASY", "MEDIUM", "HARD"]), diagram: diagramSchema });
export const generationInput = z.object({ request_id: z.uuid(), set_id: z.uuid(), count: z.number().int().min(1).max(20), question_type: z.enum(["MULTIPLE_CHOICE", "ESSAY"]), difficulty: z.enum(["EASY", "MEDIUM", "HARD"]), include_image: z.boolean(), instructions: z.string().max(2000), replace_id: z.uuid().optional() }).refine(v => !v.replace_id || v.count === 1);
export type QuestionContent = z.infer<typeof questionSchema>;
export function validateQuestion(q: QuestionContent) {
 if (q.question_type === "MULTIPLE_CHOICE" && (q.options.length < 2 || !q.options.includes(q.answer) || new Set(q.options).size !== q.options.length)) throw new Error("Pilihan dan kunci jawaban belum konsisten.");
 if (q.diagram && q.diagram.labels.length !== q.diagram.values.length) throw new Error("Data diagram tidak lengkap.");
 return q;
}
