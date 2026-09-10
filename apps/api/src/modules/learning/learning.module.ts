import { AuthModule } from "../auth/auth.module";
import { Module } from "@nestjs/common";
import { SupabaseModule } from "../../common/supabase/supabase.module";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { LearningService } from "./learning.service";
import { AssignmentsController, CoursesController, LessonsController, SubmissionsController } from "./learning.controller";
@Module({ imports: [AuthModule, SupabaseModule, AuthorizationModule], controllers: [CoursesController, LessonsController, AssignmentsController, SubmissionsController], providers: [LearningService], exports: [LearningService] })
export class LearningModule {}
