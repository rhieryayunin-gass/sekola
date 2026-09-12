// @vitest-environment node
import { beforeEach,describe,expect,it,vi } from "vitest";
const {getClaims,rpc,generateText}=vi.hoisted(()=>({getClaims:vi.fn(),rpc:vi.fn(),generateText:vi.fn()}));
vi.mock("../../../../../lib/supabase/server",()=>({createClient:async()=>({auth:{getClaims},rpc})}));
vi.mock("ai",()=>({generateText,Output:{object:vi.fn()}}));
vi.mock("@ai-sdk/gateway",()=>({gateway:vi.fn()}));
import { POST } from "./route";
const body={request_id:"00000000-0000-4000-8000-000000000001",set_id:"00000000-0000-4000-8000-000000000002",count:1,question_type:"MULTIPLE_CHOICE",difficulty:"EASY",include_image:false,instructions:"Addition"};
const request=(origin="https://osekola.com")=>new Request("https://osekola.com/api/school/questions/generate",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();getClaims.mockResolvedValue({data:{claims:{sub:"teacher"}}});rpc.mockResolvedValue({data:{title:"Addition"}});});
describe("Teacher AI generation",()=>{
 it("rejects cross-site requests before database and model access",async()=>{expect((await POST(request("https://untrusted.invalid"))).status).toBe(403);expect(getClaims).not.toHaveBeenCalled();expect(generateText).not.toHaveBeenCalled();});
 it("requires a verified session and quota authorization",async()=>{getClaims.mockResolvedValueOnce({data:null});expect((await POST(request())).status).toBe(401);rpc.mockResolvedValueOnce({error:{code:"42501",message:"Teacher required"}});expect((await POST(request())).status).toBe(403);expect(generateText).not.toHaveBeenCalled();});
 it("persists successful output as review-required before responding",async()=>{generateText.mockResolvedValue({output:{questions:[{question_type:"MULTIPLE_CHOICE",prompt:"What is 2 + 2?",options:["3","4","5","6"],answer:"4",explanation:"Two pairs make four.",difficulty:"EASY",diagram:null}]},totalUsage:{inputTokens:120,outputTokens:90}});const response=await POST(request());expect(response.status).toBe(200);expect((await response.json()).review_required).toBe(true);expect(rpc).toHaveBeenLastCalledWith("school_ai_finish",expect.objectContaining({items:expect.any(Array),usage_data:expect.objectContaining({input_tokens:120,output_tokens:90})}));});
 it("records a failed reservation without exposing provider errors",async()=>{generateText.mockRejectedValue(new Error("upstream secret detail"));const response=await POST(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain("upstream secret detail");expect(rpc).toHaveBeenLastCalledWith("school_ai_finish",expect.objectContaining({items:null}));});
});
